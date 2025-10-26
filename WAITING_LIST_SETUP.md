# Waiting List Form Setup

## reCAPTCHA Setup (SPAM PROTECTION)

**IMPORTANT**: To prevent spam submissions, you need to set up reCAPTCHA:

1. **Get reCAPTCHA Keys**: Go to [Google reCAPTCHA](https://www.google.com/recaptcha/admin/create)
2. **Create a new site**:
   - Label: "BallBrain Waitlist"
   - reCAPTCHA type: v2 Checkbox ("I'm not a robot")
   - Domains: Add your domain (e.g., `ballbrain.app`, `localhost` for testing)
3. **Copy your Site Key**: You'll receive a site key like `6LdXXXXX_XXXXX-XXXXXX`
4. **Replace in HTML**: In `index.html` line 492, replace `YOUR_RECAPTCHA_SITE_KEY` with your actual site key

The form is already configured with Formspree endpoint!

## Quick Setup Instructions

The waiting list form is now set up to collect leads from your website. Here's how to make it fully functional:

## Option 1: Using Formspree (Recommended - Easiest)

1. **Sign up for Formspree**: Go to [formspree.io](https://formspree.io/) and create a free account
2. **Create a new form**: Click "New Form" in your dashboard
3. **Copy your form ID**: You'll get a form URL like `https://formspree.io/f/YOUR_FORM_ID`
4. **Replace the placeholder**: In `index.html`, replace `[YOUR_FORM_ID]` with your actual form ID in two places:
   - Line 486: In the `<form>` action attribute
   - Line 21 in script.js: In the fetch URL

That's it! Formspree will send you emails with each submission.

## Option 2: Using Your Own Backend

If you want to use your own server:

1. **Create an API endpoint** on your server to receive form data
2. **Update the form action** in `index.html` (line 486) to point to your endpoint
3. **Update the fetch URL** in `script.js` (line 21) to point to your endpoint
4. **Handle the data** on your server (store in database, send to email, etc.)

Example endpoint structure:
```
POST /api/waiting-list
Body: { name: string, email: string, position: string }
```

## Option 3: Using Google Sheets (Simple & Free)

1. **Create a Google Sheet** for storing submissions
2. **Use Google Apps Script** or a service like [SheetDB](https://sheetdb.io/) or [Zapier](https://zapier.com/)
3. **Set up a webhook** that sends data to your Google Sheet
4. **Update the form submission** in `script.js` to send to your webhook URL

## Current Features

- ✅ Name collection (required)
- ✅ Email collection (required)
- ✅ Position/basketball role (optional)
- ✅ Loading state during submission
- ✅ Success confirmation with visual feedback
- ✅ Error handling
- ✅ Form validation
- ✅ Auto-reset after successful submission

## Testing

After setting up your form handler, you can test it by:
1. Opening the website
2. Navigating to the "Join Waitlist" section
3. Filling out and submitting the form
4. Checking your email (if using Formspree) or your database/server

## Data You'll Collect

Each submission includes:
- **Name**: User's full name
- **Email**: User's email address (for notifications)
- **Position**: Basketball position (optional)
- **Timestamp**: Automatic submission timestamp
- **Subject**: "New BallBrain Waitlist Signup" (for easy filtering in emails)

## Next Steps

Once you have leads coming in, you can:
1. **Export the data** from your chosen service
2. **Create email campaigns** to notify users when the app launches
3. **Analyze your waitlist** to understand your audience
4. **Build excitement** by sharing launch updates with your waitlist

