# Lead Desk: design

*Status: draft for approval · 2026-11-19 · clickable mockup: `fb_leads_app/mockup.html`*

## 1. What it is and why

Lead Desk is a private web app for **one person (the owner)** to catch and answer Facebook leads from **several of their own Facebook Pages** in one place. It is **not for the KLP clinic Pages**.

Today, leads arrive in different corners of Facebook: Lead Ads form submissions, Page inbox messages and comments on Page posts. They're easy to miss or answer too late. Lead Desk:

1. Collects every new lead from every connected Page the moment Facebook reports it.
2. Writes a reply draft from a per-Page template.
3. Holds the draft in a **review queue**. Nothing is ever sent until the owner taps **Send**.
4. Logs every lead to a **Google Sheet** and emails the owner an **alert** (read on their phone).
5. Lets the owner **post to their Pages** from the app.
6. Helps with **group posting** by copying the text and opening the group. The owner posts manually (see Constraints).

It must work on **Mac, Windows, Android and iPhone**. It's one hosted website that can also be "added to home screen" on phones.

**Success:** no lead waits unanswered because it was missed. The owner can clear the queue from their phone in a minute or two, and the Sheet is a complete record.

## 2. Goals, non-goals, anti-goals

**Goals (v1)**
- Sign in with Facebook (official login only). Connect **multiple Pages** and add or remove them later.
- Lead intake from three sources, on every connected Page:
  - Lead Ads form submissions (with all form answers, including phone and email when the form asks for them).
  - New messages to the Page inbox (Messenger).
  - New top-level comments on the Page's posts.
- Review queue with Edit / Skip / Send, covering all Pages or filtered to one Page.
- Per-Page reply templates for each source, with a `{first}` name placeholder. If the lead has no phone number, the draft ends with a line asking for one.
- Sending on the right channel (see 4.4), with a visible countdown when a Facebook reply window is closing.
- Phone numbers shown with Call (tel: link) and Copy.
- Every lead appended to one Google Sheet. Status updates (Waiting / Replied / Skipped) are written back to that row.
- An email alert to the owner for each new lead.
- Follow-up notifications for unanswered leads and quiet leads (see 4.5).
- **Page posting:** write a post (text, optionally one image or a link), choose one or more connected Pages, then publish now or schedule it. Show a short list of recent posts per Page.
- Group posting helper: saved post text, a list of the owner's groups (entered by hand), and **Open & copy**.
- Installable on phones (home-screen icon, full-screen).

**Non-goals (v1)**
- AI-written replies. Drafts come from templates only.
- Multi-step follow-up sequences, or automatic follow-ups after the first reply.
- SMS or WhatsApp sending.
- Multiple users or team logins.
- Push notifications. Email is the alert channel.
- A CRM pipeline beyond Waiting / Replied / Skipped.
- Reading comments or messages on groups or the personal profile. Facebook doesn't allow it.

**Anti-goals (a failure even if it "works")**
- **Anything that sends without the owner's tap.** This includes "auto-send after X minutes."
- **Handling the owner's Facebook password**, or any browser-bot or scripted login. It risks the account being banned.
- **Automated posting to Facebook groups.** It's against Facebook's terms and risks a ban.
- **Secrets in the GitHub repo.**
- **Touching KLP Pages, the KLP Meta ad accounts, or the Meta Ads connector** used in other work.

## 3. Constraints

- **Facebook rules for messaging leads.**
  - A Page can reply in Messenger only within **24 hours** of the person's last message.
  - For a comment, a Page may send **one private reply within 7 days**.
  - A Lead Ads form submitter **can't be messaged first on Messenger**, so they are replied to by **email** (from the form's email field). With no email on the form, the lead can only be called or texted manually.
- **Facebook groups.** The Groups publishing API was removed in 2024. Group posting is copy-and-open only.
- **Facebook developer app, App Review and Business Verification.** The owner creates a free Meta developer app.
  - **What works in Development mode:** Facebook Login, listing Pages, Page posting, and test leads from Meta's Lead Ads Testing Tool.
  - **What doesn't work in Development mode:** receiving real people's messages and comments, sending them Messenger replies or comment private replies, and reliable delivery of real Lead Ads leads. Development mode only covers people who have a role on the app.
  - **Going Live:** for real leads the app must be **Live**, with **Advanced Access** to the permissions below. That needs **Meta App Review**, usually **Business Verification** of a business portfolio, a privacy-policy URL and a data-deletion URL or instructions. Expect it to take weeks.
  - **Permissions:**
    - `pages_show_list`
    - `pages_read_engagement`
    - `pages_manage_metadata`
    - `pages_read_user_content`
    - `pages_manage_posts`
    - `pages_messaging`
    - `leads_retrieval`
    - `pages_manage_ads` (required by lead retrieval)
    - `business_management`, only if the Pages are owned by a Business portfolio
  - **Lead access:** the owner must have the Advertise task on each Page, and each Page's Leads Access Manager must allow the app.
- **Privacy policy and data deletion.** The site serves a public privacy-policy page and a data-deletion instructions page.
- **Facebook access expires.** Meta expires data access after about 90 days, so the owner signs in with Facebook again periodically. The app shows a banner a week before that happens.
- **Testing.** Meta's webhook and login redirect URLs must be fixed, registered addresses, and Netlify Blobs is shared between deploy previews and production. So testing uses the **production URL with Meta's test tools** (Lead Ads Testing Tool; messages from the owner's own account, which has an app role). Deploy previews are for looking at the screens only.
- **Netlify function limits.** Synchronous functions time out after 10–26 s and take requests up to about 6 MB. The webhook acknowledges Facebook fast and keeps per-lead work small. Image uploads for Page posts are resized in the browser before upload.
- **Hosting is the owner's choice: GitHub repo → Netlify.** Secrets live only in Netlify environment variables. The repo should be private.
- **No local dev tools on the owner's Mac** (no Node, Python or Homebrew). Netlify builds and runs everything. Testing happens on Netlify deploy previews, not locally.
- **Look:** dark background with gold accents. **Bodoni Moda** for headings, names and numbers, and **DM Sans** for body text. Follow the approved mockup.

## 4. How it works

### 4.1 Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| **A. Netlify site + Netlify Functions + Netlify Blobs** | One service and one bill, free tier. Fits GitHub → Netlify. Serverless functions are fine for webhooks and short API calls. | **Chosen.** This is the owner's GitHub + Netlify pick. |
| B. Netlify front end + Supabase (database and auth) | A real database with nicer querying, but a second account and service for the owner to manage. | More than a one-person app needs. |
| C. Always-on Node server (e.g. Railway) | Simplest mental model, but about $5/month and a separate host from the one the owner picked. | Doesn't match the owner's choice. |

### 4.2 Pieces

- **Front end:** a static single-page app (plain HTML, CSS and JS, built from the mockup) plus a web app manifest and icons for "Add to home screen."
- **Functions** (Netlify Functions, JavaScript):
  - `auth-start` / `auth-callback`: Facebook Login with the permissions listed above. Exchanges the code for a long-lived user token, lists the owner's Pages and stores long-lived Page tokens for the Pages the owner picks. Subscribes the app to each Page's webhooks (`leadgen`, `messages`, `feed`). Sets a signed session cookie. **Only the owner's Facebook user ID** (set in an environment variable) may sign in; everyone else is refused.
  - `webhook`: the Meta webhook endpoint. Handles the verification handshake (GET) and checks the `X-Hub-Signature-256` signature on every POST. Turns each event into a lead:
    - `leadgen`: fetch the lead's form answers.
    - `messages`: fetch the sender's name.
    - `feed`: top-level comments only.
    - Ignores events from the Page itself, and duplicate events.
    - For every new lead, creates the draft, saves the lead, appends a Sheet row and sends the alert email.
  - `api`: authenticated endpoints the front end calls:
    - list leads
    - edit a draft
    - send / skip
    - get and save templates
    - list and add Pages
    - create posts (now or scheduled) and list recent posts
    - save the group list and group post text
  - `send`: performs the send for a lead (see 4.4), then updates its status in the store and the Sheet.
- **Store (Netlify Blobs):**
  - `pages`: id, name, color, Page token
  - `leads`: one record per lead
  - `templates`: per Page
  - `settings`: groups, alert email, Sheet id
- **Google Sheet:** written with a Google service account using the Sheets API. The owner shares the Sheet with the service account's email. One tab, `Leads`. Columns:
  - Received
  - Page
  - Source
  - Name
  - Phone
  - Email
  - What they said / form answers
  - Status
  - Replied at
  - Reply text
- **Email:** sent through the owner's **Gmail via SMTP with an app password**. The same mailbox sends both the owner's lead alerts and the email replies to form leads, so leads see a real address.

### 4.3 Lead record

- `id`, `pageId`, `source` (form / message / comment), `name`
- `phone?`, `email?`
- `said`: message text, comment text, or form answers as label/value pairs
- `receivedAt`
- `replyWindowEndsAt?`
- `fbRefs`: lead id, sender ID, or comment id
- `draft`
- `status`: waiting / sent / skipped / failed / cold
- `followUps` (count), `lastFollowUpAt?`, `lastInboundAt?`
- `sentAt?`, `sentText?`, `error?`
- `sheetRow`

### 4.4 Sending rules

| Source | Channel | Window |
|---|---|---|
| Lead Ads form | Email to the form's email address, from the owner's Gmail | None. With no email on the form, Send is disabled and the card says "No email: call or text." |
| Page message | Messenger, from that Page | 24 h from the last message. The countdown turns amber under 3 h, and Send is disabled once the window has closed. |
| Post comment | Messenger private reply to the comment, from that Page | 7 days, one reply only |

A failed send keeps the lead in the queue, marked **failed**, with the reason shown.

### 4.5 Follow-up notifications

A Netlify Scheduled Function runs every 15 minutes and raises two kinds of reminders. Each reminder is an **email to the owner** and a **"Follow up" badge** in the app.

1. **"You haven't replied yet."**
   - A lead has been Waiting for 1 h. Reminder.
   - A Messenger window is about to close: 3 h left for messages, 1 day left for comments. **Urgent reminder.**
2. **"They haven't answered you."** A lead was Replied but has gone quiet.
   - The app counts 2 days after the reply with no answer from the lead.
   - The lead then moves into a **Follow-ups** section of the review queue, with a drafted follow-up from a per-Page follow-up template.
   - The owner still approves it before it sends. The anti-goal stands: **nothing sends on its own.**
   - Channel limits apply:
     - **Form leads:** a follow-up email is always possible.
     - **Messenger:** a follow-up is possible only while the 24 h window is open. Once it closes, the card turns into a **"Call or text"** reminder, showing their phone number if known.
     - **Comment leads:** no second Messenger message is allowed. These become a call reminder if there's a phone number, and are otherwise dropped from follow-ups.
   - Each lead gets at most **2 follow-up reminders**, then it's marked **Cold**, which is a new status. The Sheet records the follow-up count and the last follow-up date.

Reminder timings (1 h, 2 days, 2 follow-ups) are settings the owner can change in the app.

## 5. Decided with the owner

- Online app on Mac, Windows, Android and iPhone.
- Leads go to a Google Sheet, with an email alert on the phone.
- Auto-drafted replies, **previewed and approved before sending**.
- Multiple Pages, with an All Pages view and a Page switcher.
- Phone numbers visible.
- Premium dark-and-gold look in Bodoni Moda and DM Sans.
- Hosted on GitHub + Netlify.
- Group posting stays manual, via copy-and-open.

## 6. Calls I made (the owner can overrule)

- **Templates, not AI, for drafts.** Simpler and predictable.
- **Netlify Blobs as the database.** No extra account.
- **Gmail SMTP for email.** Replies come from the owner's own address. Needs a Gmail app password.
- **Single owner allowlisted by Facebook user ID.** No separate passwords.
- **Group list typed in by hand.** Facebook doesn't expose which groups an account belongs to.
- **One lead per conversation for messages.**
  - A person's first message to a Page creates the lead, one Sheet row and one alert.
  - Later messages from them are added to that same lead. They also reset the 24 h countdown and refresh the draft context.
  - If the lead was already Replied or Skipped, a new message reopens it as Waiting and sends one new alert. No new Sheet row is created; the row is updated.
  - **Replies made outside the app** (in Business Suite or the Page inbox) are detected from Facebook's echo events and mark the lead Replied.
- **One lead per comment.** A person's top-level comment creates a lead. More comments from the same person on the same post are added to it.
- **Only Pages the owner ticks are ever stored or subscribed.** Every other Page, including any KLP Page the account manages, is never touched. The setup guide says this plainly.
- **No backfill in v1.** Leads count from the moment a Page is connected.

## 7. Left to the builder

- File and folder layout.
- How the front end talks to `api` (REST shape).
- Retries and rate-limit handling against Facebook and Google.
- Exact styling details beyond the mockup.
- A setup guide for the owner covering:
  - creating the Meta developer app
  - setting the webhook URL and verify token
  - creating the Google service account and sharing the Sheet
  - creating the Gmail app password
  - setting the Netlify environment variables
- How to keep the test lead flow repeatable. Meta's Lead Ads Testing Tool can fire test leads.
- Whether heavy per-lead work moves to a background or queued function if the webhook gets close to its time limit.

## 8. Open (owner to answer)

1. **Meta Business Verification and App Review.** Will the owner go through them, and is there a registered business to verify? This decides whether v1 covers all three lead sources or only Lead Ads plus Page posting.
2. **Google account.** Personal @gmail.com or Google Workspace, and is 2-Step Verification on? This decides whether Gmail app passwords and a Sheets service account work, or whether Google sign-in (OAuth) is needed instead.
3. **Other Messenger tools.** Do any of the Pages already use a Messenger tool (ManyChat, a chatbot, a CRM)? Lead Desk may not be able to reply in threads that another tool controls.
4. **The offer and the goal of the first reply.** Book a call, send details, rates? This shapes the default templates. Until it's answered, the mockup's generic templates ship as defaults.
