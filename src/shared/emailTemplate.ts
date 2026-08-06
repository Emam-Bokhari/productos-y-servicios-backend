import { ICreateAccount, IResetPassword } from "../types/emailTemplate";

const COLORS = {
  background: "#0A0A0F",
  surface: "#16161D",
  border: "#27272A",
  primary: "#EA580C",
  text: "#FEFEFE",
  secondary: "#A1A1AA",
};

const LOGO =
  "https://res.cloudinary.com/dphkhbunv/image/upload/v1783484451/Group_1707478169_toeljh.png";

const baseLayout = (title: string, content: string) => `
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1.0"
/>

<title>${title}</title>

</head>

<body
style="
margin:0;
padding:0;
background:${COLORS.background};
font-family:Arial,Helvetica,sans-serif;
">

<table
width="100%"
cellpadding="0"
cellspacing="0"
style="
background:${COLORS.background};
padding:45px 18px;
">

<tr>

<td align="center">

<table
width="100%"
cellpadding="0"
cellspacing="0"
style="
max-width:620px;
background:${COLORS.surface};
border:1px solid ${COLORS.border};
border-radius:18px;
overflow:hidden;
">

<tr>

<td
align="center"
style="padding:45px 36px 28px;"
>

<img
src="${LOGO}"
width="74"
alt="Alygo"
style="
display:block;
margin-bottom:18px;
"
/>

<h1
style="
margin:0;
font-size:30px;
color:${COLORS.text};
font-weight:700;
"
>
Alygo
</h1>

</td>

</tr>

<tr>

<td
style="
height:1px;
background:${COLORS.border};
"
></td>

</tr>

<tr>

<td
style="
padding:42px 38px;
font-size:16px;
line-height:1.8;
color:${COLORS.text};
"
>

${content}

</td>

</tr>

<tr>

<td
align="center"
style="
padding:28px;
background:#101015;
border-top:1px solid ${COLORS.border};
"
>

<p
style="
margin:0;
font-size:13px;
color:${COLORS.secondary};
"
>

This is an automated email from Alygo.

</p>

<p
style="
margin-top:12px;
font-size:12px;
color:#6B7280;
"
>

© ${new Date().getFullYear()} Alygo.
All rights reserved.

</p>

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
`;

const otpBox = (otp: string | number) => `
<table
width="100%"
cellpadding="0"
cellspacing="0"
style="margin:38px 0;"
>

<tr>

<td align="center">

<div
style="
display:inline-block;
padding:18px 42px;
background:${COLORS.primary};
border-radius:14px;
color:#fff;
font-size:34px;
font-weight:700;
letter-spacing:10px;
"
>

${otp}

</div>

</td>

</tr>

</table>
`;

const securityCard = `
<table
width="100%"
cellpadding="0"
cellspacing="0"
style="
margin-top:34px;
background:#111118;
border:1px solid ${COLORS.border};
border-radius:12px;
">

<tr>

<td
style="
padding:20px 22px;
font-size:14px;
line-height:1.9;
color:${COLORS.secondary};
"
>

<b style="color:${COLORS.text};">

Security Tips

</b>

<br><br>

• This verification code expires in
<b style="color:${COLORS.text};">
3 minutes
</b>

<br>

• Never share your verification code.

<br>

• Alygo will never ask for your OTP.

</td>

</tr>

</table>
`;

const createAccount = (values: ICreateAccount) => {
  const content = `
<h2
style="
margin:0 0 18px;
font-size:28px;
font-weight:700;
color:${COLORS.text};
"
>
Welcome, ${values.name}
</h2>

<p
style="
margin:0;
font-size:15px;
line-height:1.8;
color:${COLORS.secondary};
"
>
Welcome to <b style="color:${COLORS.text};">Alygo</b>.

Thank you for creating your account.

To verify your email address and activate your account, please enter the verification code below.
</p>

${otpBox(values.otp)}

${securityCard}

<p
style="
margin-top:34px;
margin-bottom:0;
font-size:14px;
line-height:1.8;
color:${COLORS.secondary};
"
>
If you didn't create an Alygo account, you can safely ignore this email.
No further action is required.
</p>
`;

  return {
    to: values.email,
    subject: "Verify your Alygo account",
    html: baseLayout("Verify your Alygo account", content),
  };
};

const resetPassword = (values: IResetPassword) => {
  const content = `
<h2
style="
margin:0 0 18px;
font-size:28px;
font-weight:700;
color:${COLORS.text};
"
>
Reset Your Password
</h2>

<p
style="
margin:0;
font-size:15px;
line-height:1.8;
color:${COLORS.secondary};
"
>
We received a request to reset the password for your
<b style="color:${COLORS.text};">Alygo</b> account.

Use the verification code below to continue.
</p>

${otpBox(values.otp)}

${securityCard}

<p
style="
margin-top:34px;
margin-bottom:0;
font-size:14px;
line-height:1.8;
color:${COLORS.secondary};
"
>
If you didn't request a password reset, you can safely ignore this email.
Your account remains secure.
</p>
`;

  return {
    to: values.email,
    subject: "Reset your Alygo password",
    html: baseLayout("Reset your Alygo password", content),
  };
};

interface ISupportNotification {
  to: string;
  name: string;
  email: string;
  subject: string;
  message: string;
}

const supportNotification = (values: ISupportNotification) => {
  const content = `
<h2
style="
margin:0 0 18px;
font-size:28px;
font-weight:700;
color:${COLORS.text};
"
>
New Support Request
</h2>

<p
style="
margin:0;
font-size:15px;
line-height:1.8;
color:${COLORS.secondary};
"
>
A new support request has been submitted through the
<b style="color:${COLORS.text};">Alygo</b> platform.

The request details are shown below.
</p>

<table
width="100%"
cellpadding="0"
cellspacing="0"
style="
margin-top:32px;
background:#111118;
border:1px solid ${COLORS.border};
border-radius:12px;
"
>

<tr>

<td style="padding:24px;">

<table
width="100%"
cellpadding="0"
cellspacing="0"
>

<tr>

<td
style="
padding:10px 0;
width:160px;
font-weight:700;
color:${COLORS.secondary};
"
>
Requester
</td>

<td
style="
padding:10px 0;
color:${COLORS.text};
"
>
${values.name}
</td>

</tr>

<tr>

<td
style="
padding:10px 0;
font-weight:700;
color:${COLORS.secondary};
"
>
Email
</td>

<td
style="
padding:10px 0;
color:${COLORS.text};
"
>
${values.email}
</td>

</tr>

<tr>

<td
style="
padding:10px 0;
font-weight:700;
color:${COLORS.secondary};
"
>
Subject
</td>

<td
style="
padding:10px 0;
color:${COLORS.text};
"
>
${values.subject}
</td>

</tr>

</table>

</td>

</tr>

</table>

<h3
style="
margin:34px 0 14px;
font-size:20px;
font-weight:700;
color:${COLORS.text};
"
>
Message
</h3>

<div
style="
background:#111118;
border:1px solid ${COLORS.border};
border-left:5px solid ${COLORS.primary};
border-radius:12px;
padding:24px;
font-size:15px;
line-height:1.9;
color:${COLORS.text};
white-space:pre-wrap;
word-break:break-word;
"
>
${values.message}
</div>

<table
width="100%"
cellpadding="0"
cellspacing="0"
style="margin-top:38px;"
>

<tr>

<td align="center">

<a
href="mailto:${values.email}?subject=Re:${encodeURIComponent(values.subject)}"
style="
display:inline-block;
padding:16px 36px;
background:${COLORS.primary};
color:#FFFFFF;
text-decoration:none;
border-radius:10px;
font-size:15px;
font-weight:700;
"
>
Reply to ${values.name}
</a>

</td>

</tr>

</table>

<table
width="100%"
cellpadding="0"
cellspacing="0"
style="
margin-top:36px;
background:#111118;
border:1px solid ${COLORS.border};
border-radius:12px;
"
>

<tr>

<td
style="
padding:20px 22px;
font-size:14px;
line-height:1.8;
color:${COLORS.secondary};
"
>

<b style="color:${COLORS.text};">
Internal Notification
</b>

<br><br>

This email was automatically generated after a user submitted a support request through Alygo.

<br><br>

Please review the request and respond as soon as possible.

</td>

</tr>

</table>
`;

  return {
    to: values.to,
    subject: `Alygo Support Request: ${values.subject}`,
    html: baseLayout("Support Request", content),
  };
};

export const emailTemplate = {
  createAccount,
  resetPassword,
  supportNotification,
};
