# Batch Upload Feature - LinkedIn Data Extraction Tool

## Overview
The batch upload feature allows you to upload an Excel or CSV file containing multiple LinkedIn profile URLs and automatically extract data from all profiles in the file.

## Features
- ✅ Upload Excel (.xlsx, .xls) or CSV files
- ✅ Automatically detect LinkedIn URLs in any column
- ✅ Process multiple profiles automatically
- ✅ Real-time progress tracking
- ✅ Works alongside the existing single-profile extraction method

## How to Use

### 1. Prepare Your File
Create an Excel or CSV file with LinkedIn profile URLs. The URLs can be in any column or cell. The tool will automatically find them.

**Example Excel/CSV structure:**
```
Name                | LinkedIn URL                                    | Email
John Doe            | https://www.linkedin.com/in/johndoe/           | john@example.com
Jane Smith          | https://www.linkedin.com/in/janesmith/         | jane@example.com
Bob Johnson         | https://www.linkedin.com/talent/profile/xyz123 | bob@example.com
```

**Supported URL formats:**
- `https://www.linkedin.com/in/username/`
- `https://www.linkedin.com/talent/profile/profileId`
- `https://www.linkedin.com/recruiter/profile/profileId`

### 2. Upload the File
1. Open the extension popup by clicking the extension icon
2. Scroll down to the **"📤 Batch Upload"** section
3. Click **"📁 Choose Excel File"**
4. Select your Excel (.xlsx, .xls) or CSV file
5. The file name will appear, and the tool will scan for LinkedIn URLs

### 3. Process the URLs
1. Click **"🚀 Process URLs"** button
2. Confirm the number of profiles to process
3. The tool will automatically:
   - Open each LinkedIn profile in a background tab
   - Extract the profile data
   - Save it to your Google Sheet
   - Move to the next profile

4. Monitor the progress bar to see how many profiles have been processed

### 4. View Results
Once processing is complete, all extracted data will be available in your configured Google Sheet.

## Important Notes

### Prerequisites
- ✅ Google Sheets must be configured (go to Settings first)
- ✅ You must be logged into LinkedIn
- ✅ LinkedIn rate limits apply - the tool processes one profile every 7 seconds to avoid rate limiting

### File Requirements
- **Supported formats:** .xlsx, .xls, .csv
- **URL detection:** URLs can be in any column/cell
- **Duplicates:** Automatically removed before processing
- **Invalid URLs:** Automatically filtered out

### Processing Details
- Each profile takes approximately 5-7 seconds to process
- Processing happens in a background tab
- You can minimize the extension popup while processing
- Do not close the browser during processing
- If interrupted, simply re-upload the file and process again

### Best Practices
1. **Start small:** Test with 5-10 URLs first
2. **Check configuration:** Ensure Google Sheets is properly configured
3. **Stay logged in:** Make sure you're logged into LinkedIn
4. **Be patient:** Large batches may take several minutes
5. **Monitor progress:** Keep the popup open to see progress updates

## Using Both Methods

### Single Profile Method (Original)
- Browse LinkedIn normally
- Click on any profile
- Extension automatically detects and saves data
- Best for: Real-time tracking while browsing

### Batch Upload Method (New)
- Upload a file with multiple URLs
- Automated background processing
- Progress tracking
- Best for: Processing candidate lists, bulk imports

**Both methods work independently and can be used together!**

## Troubleshooting

### "No valid LinkedIn URLs found"
- Check that your file contains actual LinkedIn URLs
- Ensure URLs start with `https://` or `http://`
- Supported patterns: `/in/`, `/talent/profile/`, `/recruiter/profile/`

### "Please configure Google Sheets first"
- Go to Settings (⚙️ button)
- Follow the Google Sheets setup guide
- Configure your service account credentials

### Processing stuck or slow
- LinkedIn has rate limits
- The tool waits 5-7 seconds between profiles
- This is normal and prevents your account from being flagged

### Some profiles not saved
- Profile may be private or restricted
- Your LinkedIn account may not have access
- Check that you're logged into LinkedIn

## Example Workflow

1. **Preparation:**
   - Export candidate list from your ATS/CRM
   - Or manually create an Excel file with LinkedIn URLs

2. **Upload:**
   - Open extension popup
   - Click "Choose Excel File"
   - Select your file

3. **Process:**
   - Click "Process URLs"
   - Confirm the count
   - Wait for completion (monitor progress bar)

4. **Review:**
   - Click "View All Candidates" to open your Google Sheet
   - Review all extracted data
   - Use for further analysis or outreach

## Support
For issues or questions, please refer to the main README.md or contact support.

---

**Version:** 2.0.0  
**Company:** Kushi Structural Consultancy Pvt Ltd
