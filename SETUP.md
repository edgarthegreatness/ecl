# Setting up Lead Desk

Do these steps in order, about an hour in total. You don't need any coding tools; everything happens in your web browser.

You'll end up with:
- **Your Lead Desk link**, e.g. `https://your-lead-desk.netlify.app`
- **A Facebook developer app**, which gives Lead Desk permission to read your Pages' leads
- **A Google Sheet** where every lead is saved
- **A Gmail app password**, so Lead Desk can email you alerts and send email replies

Keep a notes file open as you go. You'll collect about ten values, and in step 6 you'll paste them all into Netlify. **These values are secret. Never put them in GitHub or send them in chat.**

---

## 1. Put the code on GitHub

1. Go to github.com and click **New repository**. Name it `lead-desk` and choose **Private**. Click **Create repository**.
2. On the new repository page, click **uploading an existing file**.
3. In Finder, open the `lead-desk` folder. Press **⌘A** to select everything inside it, then drag it all onto the GitHub page.
4. Click **Commit changes**.

When it's done, `index.html` should **not** be at the top of the repository. You should see the folders `lib`, `netlify`, `public`, `tests` and `docs`, plus `netlify.toml` and `package.json`.

## 2. Put it on Netlify

1. In Netlify, go to **Add new site → Import an existing project → GitHub**, then pick `lead-desk`.
2. Leave every build setting as it is; the `netlify.toml` file sets them. Click **Deploy**.
3. When it says **Published**, copy the site link (`https://….netlify.app`). That's your **SITE_URL**. You can rename it under **Site configuration → Change site name**.

The site won't work until step 7. That's expected.

## 3. Create the Facebook developer app

1. Go to **developers.facebook.com** and log in with the Facebook account that manages your Pages. Click **My Apps → Create App**.
2. When asked what the app should do, choose the option for **managing your Pages / Facebook Login for Business**. When asked about a business portfolio, pick yours if you have one.
3. Open **App settings → Basic**:
   - Copy the **App ID**. That's **FB_APP_ID**.
   - Click **Show** next to the App Secret and copy it. That's **FB_APP_SECRET**.
   - **Privacy Policy URL:** `SITE_URL/privacy.html`
   - **User data deletion → Data deletion instructions URL:** `SITE_URL/data-deletion.html`
   - **App domains:** your Netlify domain without `https://`
   - Click **Save changes**.
4. Add the **Facebook Login for Business** product, if it isn't there already. In its **Settings**, add this to **Valid OAuth Redirect URIs**: `SITE_URL/auth/callback`
5. Add the **Messenger** product. You don't need to fill anything in; this just turns on message notifications.
6. Add the **Webhooks** product:
   - Choose **Page** from the dropdown and click **Subscribe to this object**.
   - **Callback URL:** `SITE_URL/webhook`
   - **Verify token:** make up a long random phrase, e.g. `plum-harbor-7741-lantern`. That's **FB_VERIFY_TOKEN**. Write it down.
   - Don't click **Verify and save** yet. You'll come back to it in step 7.
7. Check the API version. In **App settings → Advanced**, note the newest **Upgrade API version** shown, e.g. `v24.0`. That's **FB_GRAPH_VERSION**. You can leave it out and Lead Desk will use `v23.0`.

## 4. Create the Google Sheet connection

1. Create a new **Google Sheet** and name it, e.g. "Leads". Copy the long ID from its address bar, between `/d/` and `/edit`. That's **SHEET_ID**.
2. Go to **console.cloud.google.com** and create a new project called `Lead Desk`.
3. Turn on the Sheets API: go to **APIs & Services → Library**, search for **Google Sheets API**, and click **Enable**.
4. Create a service account: go to **IAM & Admin → Service Accounts → Create service account**, name it `lead-desk`, then click **Done**.
5. Click the new service account, then **Keys → Add key → Create new key → JSON**. A file downloads. Open it with TextEdit:
   - `client_email` is **GOOGLE_SA_EMAIL**.
   - `private_key` is **GOOGLE_SA_KEY**. Copy everything between the quotes, from `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----\n`.
6. Back in your Google Sheet, click **Share**, paste the **GOOGLE_SA_EMAIL**, set it to **Editor**, and click **Send**.

Lead Desk creates a tab called **Leads** with the column headings the first time a lead arrives.

> If Google says creating keys is blocked by your organization, you're on a work (Workspace) account. Do this step with a personal @gmail.com account instead.

## 5. Create a Gmail app password

1. Go to **myaccount.google.com → Security** and make sure **2-Step Verification** is **On**.
2. Search the account settings for **App passwords**. Create one called `Lead Desk`.
3. Copy the 16-letter password. That's **GMAIL_APP_PASSWORD**.
4. Your Gmail address is **GMAIL_USER**. Lead alerts go to **ALERT_EMAIL**, which can be the same address or another one you read on your phone.

## 6. Add the settings to Netlify

In Netlify, go to **Site configuration → Environment variables → Add a variable** and add each of these:

| Name | Value |
|---|---|
| `SITE_URL` | Your Netlify link, e.g. `https://your-lead-desk.netlify.app` (no slash at the end) |
| `FB_APP_ID` | From step 3 |
| `FB_APP_SECRET` | From step 3 |
| `FB_VERIFY_TOKEN` | The phrase you made up in step 3 |
| `FB_GRAPH_VERSION` | Optional, e.g. `v24.0` |
| `SESSION_SECRET` | A long random password (40+ characters) from any password generator. This keeps your login secure. |
| `SHEET_ID` | From step 4 |
| `GOOGLE_SA_EMAIL` | From step 4 |
| `GOOGLE_SA_KEY` | From step 4 (the whole private key) |
| `GMAIL_USER` | Your Gmail address |
| `GMAIL_APP_PASSWORD` | From step 5 |
| `ALERT_EMAIL` | Where lead alerts should go |

Then go to **Deploys → Trigger deploy → Deploy site**.

## 7. Connect everything

1. **Finish the webhook.** Back in the Facebook developer app, go to **Webhooks → Page**, enter the **Callback URL** and **Verify token** from step 3, and click **Verify and save**. It should save without an error. Then click **Subscribe** next to each of `feed`, `leadgen`, `messages` and `message_echoes`.
2. **Sign in.** Open your Lead Desk link and tap **Continue with Facebook**. On Facebook's screen, allow access to **every Page you want leads from**.
   - The first Facebook account that signs in becomes the **owner**. Nobody else can open your Lead Desk after that, so sign in yourself right away.
3. **Pick your Pages.** Tick the Pages to connect and tap **Connect**. Only the Pages you tick are ever touched. Leave any work or client Pages unticked.
4. **Allow lead access.** If your Pages use Lead Ads, open **Meta Business Suite → Settings → Integrations → Leads access** and make sure the Lead Desk app is allowed.

## 8. Test it

- **Form lead:** open Meta's **Lead Ads Testing Tool** (developers.facebook.com/tools/lead-ads-testing), choose your Page and a form, and click **Create lead**.
  - Within a minute, the lead should appear in Lead Desk's Review tab and in your Google Sheet, and you should get an alert email.
- **Message:** from your own Facebook account, send your Page a message. It should appear as a "Page message" lead.
- **Comment:** comment on one of your Page's posts. It should appear as a "Post comment" lead.
- **Post:** try the **Posts** tab with a scheduled post, then delete it in Meta Business Suite if you like.

**If nothing arrives:**
- Check **Netlify → Logs → Functions → webhook** for errors.
- Check that the webhook fields are subscribed.
- Check that `SITE_URL` exactly matches your link.

## 9. Go live for real leads

While the Facebook app is in **Development** mode, only people with a role on the app (you) are covered. That means real customers' messages and comments won't come through, and Lead Desk can't message them. Lead Ads leads also need the app to be Live to arrive reliably.

To open it up:
1. **Business Verification.** In Meta Business Suite, go to **Settings → Business info → Start verification**. You'll need your registered business documents (DTI/SEC, plus a utility bill or similar).
2. **App Review.** In the developer app, go to **App Review → Permissions and features** and request **Advanced Access** for:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`
   - `pages_read_user_content`
   - `pages_manage_posts`
   - `pages_messaging`
   - `leads_retrieval`
   - `pages_manage_ads`
   - `business_management`, only if your Pages belong to a business portfolio

   For each one, Facebook asks how you use it and wants a short screen recording. Record yourself using Lead Desk: signing in, the Review tab, sending a reply, and posting.
3. When the permissions are approved, switch the app from **Development** to **Live** at the top of the developer dashboard.

Review usually takes a few days to a few weeks.

## Every few months

Facebook asks you to **sign in again** about every 90 days. Lead Desk shows a banner a week before that happens. Tap **Sign in**, and you're set for another 90 days.
