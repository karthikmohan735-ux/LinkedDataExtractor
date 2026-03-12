# 🎯 LinkedIn Recruiter - Candidate Tracker

A Chrome Extension (Manifest V3) with Node.js backend to prevent duplicate candidate processing on LinkedIn Recruiter. Built for **Kushi Structural Consultancy Pvt Ltd**.

## 📋 Overview

This tool helps recruiters avoid processing the same LinkedIn candidate multiple times by:
- ✅ Automatically tracking visited LinkedIn profiles
- ⚠️ Displaying warnings for already-processed candidates
- 📊 Storing candidate data in a PostgreSQL database or Google Sheets
- 🔄 Real-time checking without user intervention
- 📤 **NEW: Batch upload Excel/CSV files with multiple LinkedIn URLs for automated processing**

### Two Ways to Extract Data

#### 1. **Single Profile Method** (Original)
Browse LinkedIn normally and the extension automatically detects and saves profile data in real-time.

#### 2. **Batch Upload Method** (NEW)
Upload an Excel or CSV file containing multiple LinkedIn URLs and automatically extract data from all profiles.

📖 **See [BATCH_UPLOAD_GUIDE.md](BATCH_UPLOAD_GUIDE.md) for detailed instructions on using the batch upload feature.**

---

## 🏗️ Architecture

```
┌─────────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Chrome Extension   │─────→│   Node.js API    │─────→│   PostgreSQL    │
│   (Frontend)        │←─────│   (Backend)      │←─────│   (Database)    │
└─────────────────────┘      └──────────────────┘      └─────────────────┘
```

### Components
1. **Frontend**: Chrome Extension (JavaScript)
2. **Backend**: Node.js + Express API
3. **Database**: PostgreSQL

---

## 📦 Project Structure

```
LinkedInDataExtractionTool/
├── backend/
│   ├── server.js          # Express API server
│   ├── db.js              # PostgreSQL connection
│   ├── package.json       # Dependencies
│   ├── .env.example       # Environment template
│   └── .gitignore
├── database/
│   └── init.sql           # Database schema
├── extension/
│   ├── manifest.json      # Chrome extension manifest
│   ├── content.js         # Main logic (LinkedIn scraper)
│   ├── background.js      # Service worker
│   ├── popup.html         # Extension popup UI
│   ├── popup.js           # Popup functionality
│   ├── styles.css         # Banner styles
│   └── icons/             # Extension icons
└── README.md
```

---

## 🚀 Setup Instructions

### Prerequisites
- **Node.js** (v16 or higher)
- **PostgreSQL** (v12 or higher)
- **Google Chrome** browser

---

### 1️⃣ Database Setup

#### Install PostgreSQL
- **Windows**: Download from [postgresql.org](https://www.postgresql.org/download/windows/)
- **Mac**: `brew install postgresql`
- **Linux**: `sudo apt-get install postgresql`

#### Create Database
```powershell
# Open PostgreSQL command line
psql -U postgres

# Create database
CREATE DATABASE linkedin_recruiter_db;

# Exit
\q
```

#### Run Schema Script
```powershell
cd database
psql -U postgres -d linkedin_recruiter_db -f init.sql
```

---

### 2️⃣ Backend Setup

```powershell
cd backend

# Install dependencies
npm install

# Create .env file
copy .env.example .env

# Edit .env with your database credentials
notepad .env
```

#### Configure `.env`
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=linkedin_recruiter_db
DB_USER=postgres
DB_PASSWORD=your_actual_password
PORT=3000
NODE_ENV=development
```

#### Start Backend Server
```powershell
# Production
npm start

# Development (with auto-reload)
npm run dev
```

You should see:
```
✅ Connected to PostgreSQL database
✅ Database connection test successful
🚀 Server running on http://localhost:3000
```

#### Test API
Open browser: `http://localhost:3000/health`

---

### 3️⃣ Chrome Extension Setup

#### Load Extension in Chrome

1. Open Chrome and go to: `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **"Load unpacked"**
4. Select the `extension` folder from this project
5. The extension should now appear in your Chrome toolbar

#### Add Icons (Optional)

The extension works without icons, but you can add custom icons:
- Create 3 PNG files: `icon16.png`, `icon48.png`, `icon128.png`
- Place them in `extension/icons/` folder
- Recommended colors: LinkedIn blue (#0a66c2)

---

## 🎮 Usage

### For Recruiters

1. **Start Backend**: Ensure the Node.js server is running (`npm start` in backend folder)

2. **Open LinkedIn Recruiter**: Navigate to any candidate profile on:
   - `linkedin.com/talent/*`
   - `linkedin.com/recruiter/*`
   - `linkedin.com/in/*`

3. **Automatic Tracking**:
   - Extension automatically extracts LinkedIn Member ID
   - Checks if candidate exists in database
   - **If New**: Saves to database + shows green success banner
   - **If Exists**: Shows red warning banner with processing date

4. **View Dashboard**: Click extension icon → "View All Candidates"

---

## 🔧 How It Works

### Content Script Logic (`content.js`)

```javascript
// 1. Extract LinkedIn Member ID from URL
const memberId = extractMemberId(); // e.g., "12345678"

// 2. Check if candidate exists
const response = await fetch(`http://localhost:3000/api/candidates/${memberId}`);

// 3a. If exists (200) → Show warning banner
if (response.status === 200) {
    injectBanner(candidateData);
}

// 3b. If new (404) → Save to database
else {
    const profileData = extractProfileData(memberId);
    await fetch('http://localhost:3000/api/candidates', {
        method: 'POST',
        body: JSON.stringify(profileData)
    });
}
```

### Member ID Extraction Patterns

The extension supports multiple LinkedIn URL formats:
```javascript
// Pattern 1: Recruiter with query param
?profileId=ACoAAABCDEF

// Pattern 2: Talent profile path
linkedin.com/talent/profile/12345678

// Pattern 3: LinkedIn URN
urn:li:member:12345678
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/api/candidates/:memberId` | Check if candidate exists |
| `POST` | `/api/candidates` | Add new candidate |
| `GET` | `/api/candidates` | Get all candidates (paginated) |
| `DELETE` | `/api/candidates/:memberId` | Delete candidate (testing) |

### Example API Usage

#### Check Candidate
```bash
curl http://localhost:3000/api/candidates/12345678
```

Response (Exists):
```json
{
  "exists": true,
  "candidate": {
    "member_id": "12345678",
    "full_name": "John Doe",
    "headline": "Senior Civil Engineer at LTTS",
    "created_at": "2025-12-29T10:30:00Z"
  }
}
```

#### Add Candidate
```bash
curl -X POST http://localhost:3000/api/candidates \
  -H "Content-Type: application/json" \
  -d '{
    "member_id": "87654321",
    "full_name": "Jane Smith",
    "headline": "Structural Engineer",
    "profile_url": "https://linkedin.com/in/janesmith"
  }'
```

---

## 🎨 UI Features

### Warning Banner (Already Processed)
```
⚠️ Candidate Already Processed
   This candidate was processed on 12/15/2025
   By: hr@kushi.com
```

### Success Banner (New Candidate)
```
✅ Candidate Added
   This candidate has been saved to the database
```

### Extension Popup
- **Total Candidates**: Shows database count
- **Server Status**: 🟢 Online / 🔴 Offline
- **Recheck Button**: Force re-check current profile
- **View All**: Opens API endpoint in new tab

---

## 📤 Batch Upload Feature (NEW)

Upload an Excel or CSV file containing LinkedIn profile URLs to automatically extract data from multiple profiles.

### Key Features
- ✅ Support for Excel (.xlsx, .xls) and CSV files
- ✅ Automatic URL detection in any column
- ✅ Real-time progress tracking
- ✅ Processes one profile every 5-7 seconds to avoid rate limiting
- ✅ Works alongside the single-profile extraction method

### Quick Start

1. **Prepare Your File**
   - Create an Excel or CSV file with LinkedIn URLs in any column
   - See [SAMPLE_FILE_FORMAT.md](SAMPLE_FILE_FORMAT.md) for examples

2. **Upload**
   - Open the extension popup
   - Scroll to "📤 Batch Upload" section
   - Click "📁 Choose Excel File"
   - Select your file

3. **Process**
   - Click "🚀 Process URLs"
   - Monitor the progress bar
   - Wait for completion

4. **View Results**
   - Click "📊 View All Candidates" to see extracted data

### Example File Format

**CSV:**
```csv
Name,LinkedIn Profile,Email
John Doe,https://www.linkedin.com/in/johndoe/,john@example.com
Jane Smith,https://www.linkedin.com/in/janesmith/,jane@example.com
```

**Excel:**
| Name      | LinkedIn Profile                          | Email             |
|-----------|------------------------------------------|-------------------|
| John Doe  | https://www.linkedin.com/in/johndoe/    | john@example.com  |
| Jane Smith| https://www.linkedin.com/in/janesmith/  | jane@example.com  |

### Supported URL Formats
- `https://www.linkedin.com/in/username/`
- `https://www.linkedin.com/talent/profile/profileId`
- `https://www.linkedin.com/recruiter/profile/profileId`

📖 **Full Guide:** [BATCH_UPLOAD_GUIDE.md](BATCH_UPLOAD_GUIDE.md)

---

## 🛠️ Development

### Debug Extension
1. Open Chrome DevTools on LinkedIn page
2. Go to **Console** tab
3. Look for `[LinkedIn Tracker]` logs

### Debug Backend
```powershell
# View logs in terminal
cd backend
npm run dev
```

### Test Database
```sql
-- View all candidates
SELECT * FROM candidates;

-- Count total
SELECT COUNT(*) FROM candidates;

-- Delete test data
DELETE FROM candidates WHERE member_id = 'test123';
```

---

## 🐛 Troubleshooting

### Extension Not Working

**Problem**: No banner appears
- ✅ Check if backend is running: `http://localhost:3000/health`
- ✅ Open Chrome DevTools → Console → Look for errors
- ✅ Reload extension: `chrome://extensions/` → Click reload icon

**Problem**: "Failed to fetch"
- ✅ Verify API URL in `content.js` (should be `http://localhost:3000/api`)
- ✅ Check CORS settings in `server.js`

### Database Errors

**Problem**: "Connection refused"
```powershell
# Check if PostgreSQL is running
Get-Service -Name postgresql*

# Start if stopped
Start-Service postgresql-x64-14  # Adjust version number
```

**Problem**: "Database does not exist"
```powershell
# Recreate database
psql -U postgres
CREATE DATABASE linkedin_recruiter_db;
\q

# Re-run schema
cd database
psql -U postgres -d linkedin_recruiter_db -f init.sql
```

### Backend Issues

**Problem**: Port 3000 already in use
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill process (replace PID)
taskkill /PID <PID> /F

# Or change port in .env
PORT=3001
```

---

## 🔐 Security Considerations

### For Production Deployment

1. **CORS**: Update allowed origins in `server.js`
```javascript
const allowedOrigins = ['chrome-extension://YOUR_ACTUAL_EXTENSION_ID'];
```

2. **Environment Variables**: Never commit `.env` file
```powershell
# Add to .gitignore
echo .env >> .gitignore
```

3. **Database**: Use connection pooling and prepared statements (already implemented)

4. **HTTPS**: Deploy backend with SSL certificate

---

## 📊 Database Schema

```sql
CREATE TABLE candidates (
    member_id VARCHAR(255) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    headline TEXT,
    location VARCHAR(255),
    current_company VARCHAR(255),
    profile_url TEXT NOT NULL,
    processed_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🚀 Future Enhancements

- [ ] Add user authentication for recruiters
- [ ] Export candidates to Excel/CSV
- [ ] Email notifications for duplicate attempts
- [ ] Advanced search and filtering in popup
- [ ] LinkedIn API integration (requires Premium)
- [ ] Team collaboration features
- [ ] Candidate status tracking (interviewed, rejected, hired)

---

## 📝 License

MIT License - Free for internal use at Kushi Structural Consultancy Pvt Ltd

---

## 👨‍💻 Developer

**Company**: Kushi Structural Consultancy Pvt Ltd  
**Project**: LinkedIn Recruiter Candidate Tracker  
**Version**: 1.0.0  
**Date**: December 2025

---

## 📞 Support

For issues or questions:
1. Check the **Troubleshooting** section above
2. Review Chrome console logs (`[LinkedIn Tracker]` prefix)
3. Verify backend logs in terminal
4. Contact the development team

---

## 🎯 Quick Start Checklist

- [ ] PostgreSQL installed and running
- [ ] Database created (`linkedin_recruiter_db`)
- [ ] Schema initialized (`init.sql`)
- [ ] Backend dependencies installed (`npm install`)
- [ ] `.env` file configured with database credentials
- [ ] Backend server running (`npm start`)
- [ ] Chrome extension loaded in Developer Mode
- [ ] Extension permissions granted for LinkedIn
- [ ] Tested on a LinkedIn profile page

---

**Happy Recruiting! 🎉**
