# Teacher dashboard: security audit of the proposed design

**Date:** 4 September 2026
**Status:** design-stage review, before any code is written
**For:** Nathan Benn, Wesley College IT, the school's privacy lead
**Scope:** the proposed teacher dashboard for the Writing Sidekick (class codes, first names, per-child goals, class trends, admin role). The live student app is covered by the 4 September readiness audit and its fixes.

## Verdict

The design can be made safe for a school pilot, with two honest caveats.

1. It changes what the app is. Today the Writing Sidekick keeps nothing. With the dashboard it keeps a small amount of student personal information (first names plus assessment results) in a database the school does not run. That needs the school's privacy lead to sign off, and the collection notice on the app and the privacy page must change before the first child is added.
2. The weakest points are people and devices, not code: a teacher's signed-in laptop left open, an invite link forwarded, a child tapping the wrong name. The design below reduces each of these but cannot remove them, and the school's normal device and classroom practices matter as much as the software.

If the fourteen controls in "Build these in" are all present, and the five decisions at the end are made, I would be comfortable with a supervised pilot in one or two classes.

## The design being audited

Pieces, and who talks to whom:

- **Student app** (static site on GitHub Pages, pinned to shared iPads). Calls the Vercel functions for reading photos, feedback, level up and speech. New: sends a class code with every call and, after each piece, a small result record.
- **Teacher page** (same site, `teacher.html`). Signs in, manages classes and names, shows goals and trends.
- **Vercel functions** (Sydney region). Hold the OpenAI key. New: sign-in, class and student management, result writes, dashboard reads, admin actions.
- **Database** (Postgres, hosted in Sydney, for example Neon through Vercel). New.
- **OpenAI** (photos, writing and feedback text pass through, nothing is stored there by the app; retention on OpenAI's side is the school's arrangement).

Sign-in, with no Google and no Microsoft accounts available:

- Nathan (and any other admin) adds a teacher by school email address. The system makes a one-time invite link. Nathan sends it himself in Teams or Outlook.
- The teacher opens the link once, sets a passcode, and the device stays signed in for 30 days.
- Roles: **teacher** sees only their own classes; **admin** sees all classes across all year levels and can add teachers.

Data kept per piece of writing: date, class, student (first name), kind of writing, the ten area statuses, the highest-impact goal, which power-ups were used in Level up. Optional, decision pending: the practice spelling words.

Never kept: photos, the typed writing, the feedback text, the child's revised writing.

## What is being protected

| Asset | Why it matters | Where it lives |
|---|---|---|
| The OpenAI key | Anyone holding it can spend the school's money | Vercel environment only |
| Teacher and admin sign-in | An admin account reaches every child in the school | Passcode hashes and session tokens in the database |
| First names plus results | Personal information about children, low sensitivity per record, meaningful in bulk | Database |
| Class codes | A code lets a device use the AI and write results into that class | Database, and the shared iPads |
| The writing itself | The most sensitive thing in the system, and the reason it is never stored | Memory on the iPad, in transit to OpenAI, then gone |
| Availability | If the dashboard is down the student app must still give feedback | Vercel, Neon |

## Threats, and what the design does about each

Severity is my judgement of likelihood times impact for a primary school setting.

### 1. A stranger uses the school's AI, or writes rubbish into a class (high)

Today the endpoints are open to any request from the app's own pages. With class codes required on every call, a call without a valid code is refused before anything is sent to OpenAI.

Controls: codes drawn from a large word list plus digits so they cannot be guessed (at least a billion combinations); ten wrong codes from one address in an hour locks that address out for an hour; a teacher can rotate a class code at any time; codes stop working when the class is archived; a per-class daily cap on AI calls and a global daily cap; the existing pause switch.

Remains: a child who reads the code off an iPad can use the app at home. That is acceptable, and the cap bounds the cost.

### 2. A child taps another child's name (high likelihood, low impact)

Any child using a class iPad can pick any first name. Results would land under the wrong child.

Controls: a "Not you? Tap here" line on every screen after the name is chosen; the teacher can move or delete any result from the dashboard; the name choice is cleared on Finish and by the idle clear, so the next child always chooses afresh.

Decision: an optional four-digit PIN per child, set by the teacher, for Years 4 to 6. I would not turn this on for Years 1 to 3.

### 3. A teacher account is taken over (medium likelihood, high impact)

Ways in: a forwarded invite link, a guessed passcode, a laptop left signed in, a stolen session token.

Controls: invite links work once and expire in 48 hours; passcodes at least ten characters, checked against a list of common passwords, hashed with scrypt (built into Node, no extra library); five wrong passcodes locks the account for fifteen minutes and emails nothing (there is no email sender), so the lockout is visible to an admin; session tokens are long random strings stored hashed, never a signed cookie the browser can read, 30-day life, revoked on passcode change and by "Sign out everywhere"; an admin can revoke any teacher's sessions; passkeys (Face ID, Touch ID, Windows Hello) offered as an upgrade in a later release.

Remains: a signed-in device in the wrong hands for up to 30 days. The school's device lock policy is the real control here.

### 4. An admin account is taken over (low likelihood, very high impact)

An admin sees every class. Controls: admins are created only by another admin, never by self-service; the first admin is set by environment variable at deploy time; admins must use a longer passcode (fourteen characters) and are the first group moved to passkeys; every admin action (add teacher, delete class, export) is written to an audit log the other admins can see; at least two admins so one lost account does not lock the school out.

### 5. One teacher reads another teacher's class by editing a request (medium)

This is the most common flaw in dashboards of this kind. Controls: every database query includes the signed-in teacher's id as a filter, and the admin role is checked on the server, never trusted from the browser; a test suite that signs in as teacher A and tries every read and write against teacher B's class, expecting a refusal each time; class and student ids are random, not sequential.

### 6. Data leaks in transit or at rest (low)

HTTPS on every hop (GitHub Pages, Vercel, Neon all enforce it); the database encrypts at rest; the writing is never stored, which removes the worst case outright; results carry no surname, no date of birth, no free text; exports go only to the signed-in teacher or admin, as a download, and the filename carries the date so old exports are recognisable.

### 7. Hostile input: names, exports, the dashboard page (medium)

First names are typed by teachers, then shown on iPads and in the dashboard. Controls: everything rendered as text, never as HTML; a content security policy on the teacher page; all database access through parameterised queries; spreadsheet exports escape cells that begin with = + - or @ so a name cannot become a formula; name length capped at 40 characters.

### 8. Logs and error messages leak something (medium)

Controls: the functions log counts, durations and status codes only; never a name, a class code, writing or feedback; error messages to the browser stay child-safe and generic; Vercel log retention left at the default (short).

### 9. The database is unavailable (low)

Controls: the student app never waits on the database. A result record is sent after feedback is shown, in the background, and retried once; if it fails, the child still has their feedback and the teacher is missing one row, which the dashboard notes as "not recorded". The dashboard itself simply shows an error page.

### 10. Secrets and dependencies (low)

Controls: the database address, the session pepper and the OpenAI key live only in Vercel environment variables; the static site contains no secrets; one new server dependency (the Postgres driver), pinned, with Dependabot on; rotate the OpenAI key and the pepper when staff with admin access leave.

### 11. Shared iPad hygiene (medium)

Controls: the class code may stay on the iPad (it is not personal); the chosen name is cleared on Finish, on the idle clear and when the app is reopened after an hour; nothing else is stored in the browser; the existing "Finish and clear" and idle clear stay as they are.

### 12. Privacy law and school policy (a compliance risk, not a technical one)

The database holds personal information about children, so the Australian Privacy Principles and the school's own policy apply. Controls the design offers: collection limited to what the dashboard needs; a purpose statement on the teacher page and in the app's privacy page; Sydney hosting for the database (OpenAI processing stays as it is today); a retention rule (results deleted twelve months after the piece, classes archived at year end and deleted after the following year); a teacher can delete a child and all their results in one action; an export so a parent's request for their child's data can be answered. The school still needs to record the provider arrangements (Neon, Vercel, OpenAI) and decide whether parents are told.

## Build these in (the non-negotiables)

Nothing goes to a pilot until every line is true.

1. Every AI call carries a class code, and a call without a valid one is refused before OpenAI is contacted.
2. Class codes are unguessable, rotatable, rate-limited and die with the class.
3. Per-class and global daily caps on AI calls.
4. Invite links are single-use and expire in 48 hours.
5. Passcodes: ten characters minimum (fourteen for admins), common-password check, scrypt hashing, lockout after five failures.
6. Sessions are random tokens stored hashed, 30 days, revocable, "Sign out everywhere".
7. Every read and write is filtered by the signed-in teacher on the server; the admin role is checked on the server.
8. A cross-tenant test suite (teacher A against teacher B's data) passes with zero leaks.
9. All output rendered as text; parameterised queries; spreadsheet cells escaped; a content security policy on the teacher page.
10. Logs contain no names, codes, writing or feedback.
11. The student app never waits on the database and never fails because of it.
12. An admin audit log, and at least two admins.
13. Retention and deletion built in from the first day: delete a child, archive a class, twelve-month cut-off.
14. The app's privacy wording and the privacy page updated before the first name is added.

## Decisions for Nathan and the school

1. **Spelling words on the dashboard.** They are the child's own mistakes, so they count as writing content. My advice: leave them out for the pilot; add later if teachers ask.
2. **Student PINs.** Off for Years 1 to 3. On or off for Years 4 to 6?
3. **Who the admins are.** At least two named people. Nathan plus who?
4. **Retention.** Twelve months for results, classes deleted the year after they are archived. Agree, or a different number?
5. **Provider sign-off.** The privacy lead confirms Neon (or an alternative) in Sydney, records the OpenAI retention arrangement, and approves the new collection notice.

## What I will build to prove it

- Tests that sign in as one teacher and try to read, change, export and delete another teacher's class, students and results, expecting a refusal every time.
- Tests that a call with no class code, an expired code and a wrong code never reach the OpenAI mock.
- Tests for the lockouts (codes and passcodes) and for invite links being single-use.
- A test that the logger refuses anything that looks like a name, a code or a sentence.
- A test that a database failure still returns feedback to the child.

## What this audit is not

It is a design review by the person who will build the system. It is not a penetration test, not legal advice and not a privacy impact assessment. Once built, an independent look at the sign-in and the cross-tenant checks would be worth an afternoon of someone else's time.
