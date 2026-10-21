# Halyk POS Protocol (PAX A930RTX)

Confirmed from reverse engineering of HalykPOS_A2_1.20_PAX_A800_PAX_A930RTX.dll and live terminal tests on 192.168.8.29:8080.

## Transport

- HTTP/1.0 POST /
- Content-Type: application/json
- Response: HTTP/1.1 200 OK + JSON body (charset=UTF-8)

## Tasks

| task | request | response |
| :--- | :--- | :--- |
| echo | {"task":"echo"} | msg, result, terminalId |
| purchase | {"task":"purchase","data":{"amount":"<tenge>","terminalId":"<id>"}} | msg, result, terminalId, receiptInfo, tagRRN, cardNo, issuerName, channel, goCardInfo |
| refund | {"task":"refund","data":{"amount":"<tenge>","terminalId":"<id>"}} or {"task":"refund","data":{"xlsId":"<rrn>","terminalId":"<id>"}} | same |
| reversal | {"task":"reversal","data":{"amount":"<tenge>","terminalId":"<id>"}} | same |
| settle | {"task":"settle","data":{"printFirstReceipt":"true"}} | msg, result, terminalId, receiptInfo (full text) |

## Response format

    {"data":{"msg":"...","result":"<code>","terminalId":"..."}}

- result == "0" -> success
- result != "0" -> error, msg contains description

## Result codes

| code | meaning |
| :--- | :--- |
| "0" | success |
| "1007" | Invalid amount |

## Driver parameters (from DLL)

| name | default |
| :--- | :--- |
| DeviceAddress | 192.168.1.30:8080 |
| ConnectTimeout | 10 sec |
| WaitTimeout | 250 sec (20-600) |
| ConnectAttempt | 1 (1-10) |
| CheckOnPrintTerminal | true |
| CheckPrintOnCashRegister | false |
| UseRefundInsteadReversal | false |
| LicenseKey | empty (demo mode) |

## Terminal identity

- terminalId: 61698734
- Business: IP FIXALL ASTANA
- Previous shift total: 57250 KZT

## Open questions

- CONFIRMED: amount is in tenge as-is (multiplier = 1). amount="100" -> 100 KZT on terminal
- Full list of result codes (only 0 and 1007 confirmed)
