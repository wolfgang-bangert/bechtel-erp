#!/usr/bin/env python3
"""
Ein FinTS-Vorgang pro Aufruf. stdout = reines JSON, Prompts/Logs = stderr.

  fints_op.py --op setup --blz .. --server .. --user .. --iban .. --state PATH
  fints_op.py --op pull  --blz .. --server .. --user .. --iban .. --state PATH --days 30

PIN kommt aus der Umgebungsvariable FINTS_PIN.
TAN-Eingaben werden auf stderr angefragt und von stdin gelesen.
"""
import argparse
import base64
import datetime
import decimal
import json
import os
import sys

from fints.client import FinTS3PinTanClient, NeedTANResponse
from fints.exceptions import FinTSClientPINError


def eprint(*a):
    print(*a, file=sys.stderr, flush=True)


def ask(prompt):
    eprint(prompt)
    return sys.stdin.readline().strip()


def load_state(path):
    if path and os.path.exists(path):
        with open(path, "rb") as f:
            return base64.b64decode(f.read())
    return None


def save_state(path, client):
    if not path:
        return
    try:
        blob = client.deconstruct(including_private=True)
    except AttributeError:
        blob = client.get_data(including_private=True)
    with open(path, "wb") as f:
        f.write(base64.b64encode(blob))


# Alter eingebauter python-fints-Produkt-Code. Funktioniert laut Doku noch,
# soll aber durch eine eigene DK-Registrierung ersetzt werden (FINTS_PRODUCT_ID).
DEFAULT_PRODUCT_ID = "9FA6681DEC0CF3046BFC2F8A6"


def make_client(args):
    pin = os.environ.get("FINTS_PIN") or ""
    kwargs = dict(
        product_id=os.environ.get("FINTS_PRODUCT_ID") or DEFAULT_PRODUCT_ID,
        product_version=os.environ.get("FINTS_PRODUCT_VERSION") or "3",
        from_data=load_state(args.state),
    )
    # Manche Banken (z.B. Oberbank/Bankverlag) trennen Teilnehmernummer (user_id)
    # und Kundennummer (customer_id). Nur setzen, wenn abweichend angegeben.
    if getattr(args, "customer", None):
        kwargs["customer_id"] = args.customer
    return FinTS3PinTanClient(args.blz, args.user, pin, args.server, **kwargs)


def choose_tan_mechanism(client):
    mechs = client.get_tan_mechanisms()
    if not mechs:
        return
    if client.get_current_tan_mechanism() in mechs:
        return
    if len(mechs) == 1:
        client.set_tan_mechanism(list(mechs.keys())[0])
        return
    eprint("Verfügbare TAN-Verfahren:")
    keys = list(mechs.keys())
    for i, k in enumerate(keys):
        eprint(f"  [{i}] {k} {getattr(mechs[k], 'name', '')}")
    idx = int(ask("Nummer wählen:") or "0")
    client.set_tan_mechanism(keys[idx])


def choose_tan_medium(client):
    try:
        needs = client.is_tan_media_required()
    except Exception:
        needs = False
    if not needs:
        return
    media = client.get_tan_media()
    names = [m.tan_medium_name for m in media[1] if getattr(m, "tan_medium_name", None)]
    if not names:
        return
    if len(names) == 1:
        client.set_tan_medium(media[1][0])
        return
    eprint("TAN-Medien:")
    for i, n in enumerate(names):
        eprint(f"  [{i}] {n}")
    idx = int(ask("Nummer wählen:") or "0")
    client.set_tan_medium(media[1][idx])


def _challenge_text(response):
    import re
    if getattr(response, "challenge_html", None):
        return re.sub("<[^>]+>", "", str(response.challenge_html)).strip()
    if getattr(response, "challenge", None):
        return str(response.challenge).strip()
    return ""


def resolve_tan(client, response: NeedTANResponse):
    eprint("── TAN erforderlich ──")
    ch = _challenge_text(response)
    if ch:
        eprint(ch)

    if getattr(response, "decoupled", False):
        # pushTAN ohne TAN-Eingabe: in der App freigeben, wir fragen die Bank ab.
        for _ in range(30):
            ask("In der App freigeben, dann hier ENTER drücken …")
            res = client.send_tan(response, None)
            if not isinstance(res, NeedTANResponse):
                return res
            response = res
        raise Exception("Freigabe in der App nicht erkannt (Timeout)")

    tan = ask("TAN eingeben:")
    return client.send_tan(response, tan)


def with_tan(client, result):
    while isinstance(result, NeedTANResponse):
        result = resolve_tan(client, result)
    return result


def norm_iban(s):
    return (s or "").replace(" ", "").upper()


def find_account(client, iban):
    accounts = with_tan(client, client.get_sepa_accounts())
    for a in accounts:
        if norm_iban(a.iban) == norm_iban(iban):
            return a, accounts
    return None, accounts


def handle_login_tan(client):
    """SCA-TAN beim Login (Dialoginitialisierung), falls die Bank sie verlangt."""
    resp = getattr(client, "init_tan_response", None)
    if resp is not None:
        with_tan(client, resp)


def op_setup(args):
    client = make_client(args)
    # TAN-Verfahren/-Medium VOR dem Dialog wählen (python-fints-Vorgabe).
    choose_tan_mechanism(client)
    choose_tan_medium(client)
    with client:
        handle_login_tan(client)
        acc, accounts = find_account(client, args.iban)
    save_state(args.state, client)
    return {
        "ok": True,
        "tan_mechanism": client.get_current_tan_mechanism(),
        "accounts": [
            {"iban": a.iban, "bic": a.bic, "accountnumber": a.accountnumber}
            for a in accounts
        ],
        "matched": bool(acc),
    }


def op_pull(args):
    client = make_client(args)
    choose_tan_mechanism(client)
    choose_tan_medium(client)
    with client:
        handle_login_tan(client)
        acc, _ = find_account(client, args.iban)
        if not acc:
            raise SystemExit(json.dumps({"error": f"IBAN {args.iban} nicht im Zugang gefunden"}))
        end = datetime.date.today()
        start = end - datetime.timedelta(days=args.days)
        txns = with_tan(client, client.get_transactions(acc, start, end))
        bal_amount = None
        bal_date = None
        try:
            bal = with_tan(client, client.get_balance(acc))
            b_amt = getattr(bal, "amount", None)
            if b_amt is not None:
                v = b_amt.amount
                bal_amount = float(v) if isinstance(v, decimal.Decimal) else v
            bd = getattr(bal, "date", None)
            bal_date = bd.isoformat() if bd else None
        except Exception as e:  # noqa: BLE001
            eprint(f"(Saldo nicht abrufbar: {type(e).__name__}: {e})")
    save_state(args.state, client)

    out = []
    if True:
        for t in txns:
            d = t.data
            amt = d.get("amount")
            val = amt.amount if amt is not None else None
            out.append(
                {
                    "booking_date": d["date"].isoformat() if d.get("date") else None,
                    "value_date": d["guessed_entry_date"].isoformat()
                    if d.get("guessed_entry_date")
                    else (d["entry_date"].isoformat() if d.get("entry_date") else None),
                    "amount": float(val) if isinstance(val, decimal.Decimal) else val,
                    "currency": (amt.currency if amt is not None else "EUR"),
                    "purpose": (d.get("purpose") or "").strip(),
                    "applicant_name": d.get("applicant_name"),
                    "applicant_iban": d.get("applicant_iban"),
                    "applicant_bin": d.get("applicant_bin"),
                    "posting_text": d.get("posting_text"),
                    "prima_nota": d.get("prima_nota"),
                    "end_to_end_reference": d.get("end_to_end_reference"),
                    "customer_reference": d.get("customer_reference"),
                    "bank_reference": d.get("bank_reference"),
                    "return_debit_notes": d.get("return_debit_notes"),
                }
            )
        return {
            "ok": True,
            "iban": norm_iban(acc.iban),
            "count": len(out),
            "transactions": out,
            "balance": bal_amount,
            "balance_date": bal_date,
        }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--op", required=True, choices=["setup", "pull"])
    p.add_argument("--blz", required=True)
    p.add_argument("--server", required=True)
    p.add_argument("--user", required=True)
    p.add_argument("--customer", default="")
    p.add_argument("--iban", required=True)
    p.add_argument("--state", default="")
    p.add_argument("--days", type=int, default=30)
    args = p.parse_args()
    try:
        res = op_setup(args) if args.op == "setup" else op_pull(args)
    except FinTSClientPINError as e:
        print(json.dumps({"error": f"PIN abgelehnt: {e}"}))
        sys.exit(2)
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}))
        sys.exit(1)
    print(json.dumps(res))


if __name__ == "__main__":
    main()
