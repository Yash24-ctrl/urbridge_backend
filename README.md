# UrBridge.ai Backend API

Node.js + Express + MongoDB backend for the UrBridge.ai Resume Analyzer.

## Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Key variables:
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for signing JWT tokens
- `GOOGLE_CLIENT_ID` - From Google Cloud Console (same as frontend)
- `SMTP_*` - For password reset emails (optional)

### 3. Start MongoDB
Make sure MongoDB is running locally, or use MongoDB Atlas for cloud hosting.

### 4. Run the Server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:5000` by default.

## API Endpoints

### Auth (`/api/user`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Register new user |
| POST | `/login` | Email/password login |
| POST | `/google-login` | Google OAuth login |
| POST | `/forgot-password` | Send reset link |
| POST | `/reset-password` | Reset with token |
| GET | `/me` | Get current user (protected) |

### Resume (`/api/resume`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/profile` | Save/update profile |
| GET | `/profile` | Get profile |
| POST | `/analysis` | Save analysis result |
| GET | `/analysis` | Get analysis history |
| GET | `/analysis/latest` | Get latest analysis |
| DELETE | `/analysis/:id` | Delete analysis |
| POST | `/upload` | Upload CV PDF |
| GET | `/uploads` | Get uploads |
| DELETE | `/upload/:id` | Delete upload |
| POST | `/upload/:id/analysis` | Save upload-linked analysis |

## Database Models

- **User** - Authentication (email, password, googleId, reset tokens)
- **ResumeProfile** - One per user (skills, experience, education, etc.)
- **Analysis** - Score + suggestions history
- **CVUpload** - PDF file metadata and extracted text

