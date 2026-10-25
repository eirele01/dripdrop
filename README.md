# DripDrop - Water Dispenser Duty Tracker

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-blue)
![Prisma](https://img.shields.io/badge/Prisma-6.11-blue)
![NextAuth](https://img.shields.io/badge/NextAuth-4.24-blue)
![Neon](https://img.shields.io/badge/Neon-Database-00c7b7)

A modern water dispenser duty tracker built with **Next.js 16**, **Prisma**, and **Neon Database**. Track refill tasks, manage rotations, and handle dispenser schedules with an elegant admin interface.

> **Built for open source community contribution! 🎉**

---

## 🌟 Features

- **Task Management** - Create, edit, reassign, and complete refill tasks
- **Rotation System** - Auto-rotating duty schedules with live queue tracking
- **Admin Panel** - Comprehensive admin dashboard for managing users, dispensers, and schedules
- **Proof Photos** - Upload and view refill proof photos (stored on S3-compatible storage)
- **Responsive Design** - Works perfectly on desktop and mobile
- **Internationalization Ready** - Built with `next-intl` support

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- A **Neon** database account (free tier available)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/dripdrop.git
   cd dripdrop

2. **Install dependencies**
   ```bash
   # Using Bun (recommended - fastest)
   bun install

   # Or using npm
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your database credentials
   ```

4. **Initialize the database**
   ```bash
   # Generate Prisma client
   bun prisma generate

   # Push schema to your database
   bun prisma db push --accept-data-loss
   ```

5. **Start the development server**
   ```bash
   bun dev
   ```

6. **Open in browser**
   ```
   http://localhost:3000
   ```

---

## 📋 Environment Variables

Create a `.env.local` file in the root directory:

```env
# Database (Neon)
DATABASE_URL="postgresql://user:password@ep-xxx.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# NextAuth
NEXTAUTH_SECRET="your-super-secret-key-change-in-production"
NEXTAUTH_URL="http://localhost:3000"

# S3-compatible Storage (Neon Free Tier or other S3 providers)
AWS_ENDPOINT_URL_S3="https://your-storage-url.storage.c-xx.aws.neon.tech"
AWS_ACCESS_KEY_ID="your-access-key-id"
AWS_SECRET_ACCESS_KEY="your-secret-access-key"
AWS_REGION="ap-southeast-1"
S3_BUCKET="assets"
```

---

## 🛠️ Available Commands

| Command | Description |
|---------|-------------|
| `bun dev` | Start development server at `http://localhost:3000` |
| `bun build` | Build for production |
| `bun start` | Start production server |
| `bun db:push` | Push Prisma schema to database |
| `bun db:migrate` | Create and run database migration |
| `bun db:generate` | Generate Prisma client |

---

## 🏗️ Project Structure

```
dripdrop/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/                   # Next.js app router pages
│   │   ├── api/               # API routes
│   │   │   ├── auth/          # NextAuth routes
│   │   │   ├── admin/         # Admin API routes
│   │   │   └── files/         # File serving routes
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   │   └── admin/             # Admin-specific components
│   ├── lib/                   # Utility functions
│   │   ├── db.ts              # Prisma client
│   │   ├── auth.ts            # NextAuth configuration
│   │   └── s3.ts              # S3 upload utilities
│   └── types/                 # TypeScript type definitions
├── uploads/                   # Local uploads (ignored by git)
├── public/                    # Static assets
└── package.json
```

---

## 🔑 Authentication

This project uses **NextAuth.js** with credential-based authentication.

1. Create an admin user via the database or API
2. Login at `/login`
3. Use the admin panel at `/admin`

---

## ☁️ Deployment to Vercel

### Steps:

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/your-username/dripdrop.git
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click **Add New Project**
   - Import your GitHub repository
   - Configure environment variables in Vercel dashboard:
     - `DATABASE_URL`
     - `NEXTAUTH_SECRET`
     - `AWS_ACCESS_KEY_ID`
     - `AWS_SECRET_ACCESS_KEY`
     - `S3_BUCKET`
   - Deploy!

### Build Command (Vercel)
```
bun prisma generate && bun prisma db push --accept-data-loss
```

### Important Notes:
- **Database**: Use Neon (free tier) for Vercel deployment
- **Storage**: Configure Vercel Blob or S3-compatible storage for proof photos
- **Output**: `standalone`

---

## 🗄️ Database Schema

### Models

- **User** - User accounts with role (ADMIN/MEMBER)
- **Dispenser** - Water dispenser devices
- **Schedule** - Recurring refill schedules
- **RefillTask** - Individual refill tasks
- **RotationQueue** - Rotation queue management
- **RotationMember** - Members in rotation
- **RotationTurn** - Completed rotation turns

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📧 Contact

**Project Link:** [https://github.com/eirele01/dripdrop](https://github.com/eirele01/dripdrop)

---

Made with ❤️ by [eirele01](https://github.com/eirele01)
