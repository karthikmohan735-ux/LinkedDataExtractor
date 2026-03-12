# Quick Start: Batch Upload Feature

## 🚀 Get Started in 3 Steps

### Step 1: Prepare Your File

Create a simple CSV file with LinkedIn URLs:

```csv
LinkedIn URLs
https://www.linkedin.com/in/person1/
https://www.linkedin.com/in/person2/
https://www.linkedin.com/in/person3/
```

Or use the included test file: `test-profiles.csv`

### Step 2: Upload to Extension

1. Click the extension icon in Chrome
2. Scroll to **"📤 Batch Upload"** section
3. Click **"📁 Choose Excel File"**
4. Select your CSV or Excel file

### Step 3: Process

1. Click **"🚀 Process URLs"**
2. Confirm when prompted
3. Watch the progress bar
4. Done! ✅

## ⚙️ Prerequisites

Before using batch upload, make sure:

- ✅ You're logged into LinkedIn
- ✅ Google Sheets is configured (go to Settings ⚙️)
- ✅ The extension is loaded in Chrome

## 💡 Tips

- **Start small:** Try 5-10 profiles first
- **Be patient:** Each profile takes ~7 seconds (prevents rate limiting)
- **Stay logged in:** Keep LinkedIn session active
- **Check results:** View data in Google Sheets after completion

## 📖 Need More Help?

- **Detailed Guide:** [BATCH_UPLOAD_GUIDE.md](BATCH_UPLOAD_GUIDE.md)
- **File Examples:** [SAMPLE_FILE_FORMAT.md](SAMPLE_FILE_FORMAT.md)
- **Full Documentation:** [README.md](README.md)

## 🎯 How Long Will It Take?

| Profiles | Estimated Time |
|----------|---------------|
| 10       | ~1 minute     |
| 50       | ~6 minutes    |
| 100      | ~12 minutes   |
| 500      | ~1 hour       |

## ✨ What's Included

Your extension now has:
- 📤 File upload button
- 📊 Progress tracking
- 🔄 Automatic processing
- ✅ Status notifications

## 🆘 Troubleshooting

**"No valid LinkedIn URLs found"**
→ Make sure URLs contain `linkedin.com/in/` or `/talent/profile/`

**"Please configure Google Sheets first"**
→ Click Settings ⚙️ and follow the setup guide

**Processing is slow**
→ This is normal! We wait 7 seconds per profile to avoid rate limits

**Some profiles not saved**
→ Check if you have access to those profiles on LinkedIn

---

## 🎉 You're Ready!

Upload your first batch and let the extension do the work!

**Test File Included:** `test-profiles.csv` (5 sample profiles)
