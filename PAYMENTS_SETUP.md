# PicSeller Payments: production checklist

The interface and API connector use **Opn Payments**. It was selected because the Thailand integration catalogue lists PromptPay, TrueMoney Wallet, credit/debit cards and Alipay among supported payment methods.

## 1. Complete merchant onboarding

Ask Opn to enable the four required channels for the Thailand merchant account:

- PromptPay QR
- TrueMoney Wallet
- Credit/debit cards
- Alipay Online

Do not turn on the public checkout before each requested channel has been approved in the merchant dashboard. Availability varies by merchant account, risk review and customer location.

## 2. Add Vercel Production environment variables

Add these to **Production** (and separate test values to Preview if testing):

```text
OPN_SECRET_KEY=skey_...
OPN_PUBLIC_KEY=pkey_...
OPN_WEBHOOK_TOKEN=<long-random-secret>
PAYMENT_RETURN_URL=https://webapp-bice-gamma-40.vercel.app
FIREBASE_SERVICE_ACCOUNT=<base64-json>
```

Never expose `OPN_SECRET_KEY`, `OPN_WEBHOOK_TOKEN`, or the Firebase Admin service account in any `VITE_` variable.

## 3. Configure the provider event

Register this exact event URL in the Opn dashboard:

```text
https://webapp-bice-gamma-40.vercel.app/api/payments/webhook?token=<OPN_WEBHOOK_TOKEN>
```

The handler only grants credits after it retrieves the payment again from Opn and confirms the status is `successful`. It also stores the provider charge ID, so a webhook retry cannot grant credits twice.

## 4. Test before going live

1. Use the provider's test keys and test payment methods.
2. Start a checkout from a real Firebase test account.
3. Confirm an order appears in Firestore collection `billingOrders`.
4. Complete the test payment and verify `billingEntitlements/{uid}` updates once.
5. Reload the app: plan/credit balance should reflect the entitlement.
6. Verify failed and expired payments never change credits.

## Important billing behavior

- QR, TrueMoney and Alipay are intentionally treated as **one-off** payments. Their entitlement starts only after payment confirmation.
- Card fields are tokenized by Opn in the browser; PicSeller sends only the token to its API. Raw card numbers and CVC are not stored or forwarded through Vercel.
- This connector grants purchased credits. Before public launch, move AI credit deduction into a server-side ledger too; the legacy app still has client-side deduction for image generation.
