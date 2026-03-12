# Sample File Format for Batch Upload

## Quick Start
Create an Excel or CSV file with LinkedIn URLs in any column. The tool will automatically detect and extract them.

## Sample CSV Format

```csv
Name,LinkedIn Profile,Email,Position,Company
John Doe,https://www.linkedin.com/in/johndoe/,john@example.com,Software Engineer,Tech Corp
Jane Smith,https://www.linkedin.com/in/janesmith/,jane@example.com,Product Manager,Innovation Inc
Bob Johnson,https://www.linkedin.com/talent/profile/abc123xyz,bob@example.com,Senior Developer,Code Solutions
```

## Sample Excel Format

| Name          | LinkedIn Profile                              | Email             | Position          | Company           |
|---------------|----------------------------------------------|-------------------|-------------------|-------------------|
| John Doe      | https://www.linkedin.com/in/johndoe/         | john@example.com  | Software Engineer | Tech Corp         |
| Jane Smith    | https://www.linkedin.com/in/janesmith/       | jane@example.com  | Product Manager   | Innovation Inc    |
| Bob Johnson   | https://www.linkedin.com/talent/profile/xyz  | bob@example.com   | Senior Developer  | Code Solutions    |

## Minimal Format (URLs Only)

You can also create a simple file with just the URLs:

```csv
LinkedIn URLs
https://www.linkedin.com/in/johndoe/
https://www.linkedin.com/in/janesmith/
https://www.linkedin.com/talent/profile/abc123xyz
https://www.linkedin.com/recruiter/profile/def456uvw
```

## Supported URL Patterns

✅ **Public Profiles:**
- `https://www.linkedin.com/in/username/`
- `https://linkedin.com/in/username`

✅ **Recruiter Profiles:**
- `https://www.linkedin.com/talent/profile/[profileId]`
- `https://www.linkedin.com/recruiter/profile/[profileId]`

❌ **Not Supported:**
- Company pages: `https://www.linkedin.com/company/companyname/`
- Search results URLs
- Feed or posts URLs
- Sales Navigator URLs (unless they contain profile IDs)

## Tips for Creating Your File

1. **Column Names Don't Matter:** The tool searches all cells for LinkedIn URLs, regardless of column headers.

2. **Multiple Columns:** You can have LinkedIn URLs in any column. Other data (name, email, etc.) will be ignored by the upload tool but can be useful for your records.

3. **URL Format:** Make sure URLs are complete and start with `http://` or `https://`

4. **Duplicates:** The tool automatically removes duplicate URLs, so don't worry if you have the same profile listed multiple times.

5. **Mixed Content:** It's okay to have additional data in your file. The tool will only extract LinkedIn URLs.

## Example Use Cases

### Use Case 1: Export from ATS
If you export candidates from your Applicant Tracking System (ATS) and it includes LinkedIn URLs, just upload the exported file directly.

### Use Case 2: Manual List
Create a simple spreadsheet with candidate information and LinkedIn profile URLs for manual tracking.

### Use Case 3: Research List
Copy LinkedIn URLs from your research and paste them into a single-column spreadsheet.

## Creating Your File

### Using Excel:
1. Open Microsoft Excel
2. Create a new workbook
3. Add column headers (optional): Name, LinkedIn URL, etc.
4. Paste or type LinkedIn profile URLs
5. Save as `.xlsx` or `.xls`

### Using Google Sheets:
1. Create a new Google Sheet
2. Add your data with LinkedIn URLs
3. Download as Excel (.xlsx) or CSV
4. Upload to the extension

### Using CSV:
1. Open Notepad or any text editor
2. Type URLs, one per line, or in CSV format
3. Save with `.csv` extension
4. Upload to the extension

## Sample Files

You can create a test file like this:

**test-candidates.csv:**
```
https://www.linkedin.com/in/satyanadella/
https://www.linkedin.com/in/sundarpichai/
https://www.linkedin.com/in/jeffweiner08/
https://www.linkedin.com/in/williamhgates/
https://www.linkedin.com/in/reidhoffman/
```

Upload this file to test the batch processing feature!

---

**Note:** Make sure you're logged into LinkedIn before processing, and ensure that your Google Sheets configuration is complete in the extension settings.
