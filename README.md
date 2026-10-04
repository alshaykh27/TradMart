<div align="center">🛍️ TradMart

Modern Product Marketplace & Management Platform

A modern, responsive product marketplace built with Next.js, React, TypeScript and Supabase, featuring a dynamic storefront, centralized data management, multilingual support, and a scalable application architecture.

<br/><a href="https://trad-mart.vercel.app/">
<img src="https://img.shields.io/badge/🚀%20LIVE%20DEMO-2563EB?style=for-the-badge"/>
</a><a href="https://github.com/alshaykh27/TradMart">
<img src="https://img.shields.io/badge/💻%20SOURCE%20CODE-111827?style=for-the-badge&logo=github&logoColor=white"/>
</a><br/><br/>

<img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js"/>
<img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react"/>
<img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript"/>
<img src="https://img.shields.io/badge/Supabase-Database%20%26%20Backend-3ECF8E?style=flat-square&logo=supabase"/>
<img src="https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?style=flat-square&logo=tailwindcss"/>
<img src="https://img.shields.io/badge/Vercel-Deployed-000000?style=flat-square&logo=vercel"/></div>---

✨ Overview

TradMart is a modern web-based product marketplace designed to provide a complete and scalable shopping experience.

The platform combines a polished customer-facing storefront with centralized management capabilities, allowing the application to dynamically manage and display product data while maintaining a responsive and user-friendly interface.

The project was built with a focus on:

- 🎨 Modern UI/UX
- 📱 Responsive design
- 🌍 Multilingual support
- ⚡ Performance
- 🗄️ Dynamic database-driven content
- 🔐 Secure data access
- 🧩 Reusable components
- 🏗️ Scalable architecture

---

🚀 Key Features

🛒 Customer Experience

- Dynamic homepage
- Product browsing
- Product categories
- Product details
- Latest product listings
- Responsive product cards
- Mobile-friendly interface
- Search/filter-ready architecture
- Customer-oriented shopping experience

📦 Product Management

TradMart uses a centralized data layer to dynamically manage product information.

Product data includes information such as:

- Product name
- Price
- Images
- Stock
- Categories
- Publication status
- Update timestamps

Products displayed on the storefront are retrieved dynamically from the database rather than being hard-coded into the interface.

---

🎛️ Centralized Management

The platform is designed around centralized management of the application's core data and operations.

This allows the storefront to remain connected to the underlying data layer while keeping management operations separate from the customer-facing experience.

---

🌍 Multilingual Experience

TradMart includes an internationalization layer designed to support multiple languages and localized content.

The application includes dedicated localization resources and a default Arabic experience.

---

🎨 Modern UI

The interface includes:

- Responsive layouts
- Animated interactions
- Modern hero sections
- Product cards
- Category navigation
- Trust indicators
- Responsive grids
- Interactive UI states
- Mobile-first considerations

---

🧠 Architecture

TradMart follows a modern Next.js application structure.

TradMart
│
├── app/                    # Application routes & pages
│
├── components/             # Reusable UI components
│
├── lib/                    # Shared application logic
│
├── i18n/                   # Internationalization
│
├── public/                 # Static assets
│
├── types/                  # TypeScript types
│
├── scripts/                # Sync & verification scripts
│
├── tests/                  # Automated tests
│
└── supabase/
    └── migrations/         # Database migrations

---

⚙️ Technology Stack

Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Three.js
- React Three Fiber

Backend / Data

- Supabase
- Supabase SSR
- Supabase JavaScript Client

Validation & Security

- Zod
- sanitize-html
- Server-side data access
- Environment-based configuration

Development

- Git
- GitHub
- ESLint
- Vercel

---

🔄 Data Flow

                    ┌───────────────────┐
                    │      Customer     │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │   Next.js App     │
                    │  React Components │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  Server / Lib     │
                    │ Supabase Client   │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │     Supabase      │
                    │     Database      │
                    └───────────────────┘

---

📊 Dynamic Product System

The homepage dynamically retrieves:

- Categories
- Published products
- Product prices
- Product images
- Stock information
- Product update timestamps

The application also filters categories based on whether published products actually exist, preventing empty category sections from being displayed.

This creates a database-driven storefront rather than a static product showcase.

---

🧪 Testing & Verification

The project includes dedicated scripts for testing and verification during development.

Available commands include:

npm run lint
npm test
npm run build

The repository also contains phase-specific verification scripts used during development and validation.

npm run verify:phase1
npm run verify:phase2
npm run verify:phase3.5
npm run verify:phase4
npm run verify:phase6
npm run verify:phase7
npm run verify:phase8
npm run verify:types

---

🛠️ Getting Started

1. Clone the repository

git clone https://github.com/alshaykh27/TradMart.git

2. Navigate to the project

cd TradMart

3. Install dependencies

npm install

4. Configure environment variables

Create:

.env.local

and add the required project environment variables.

«Never commit ".env.local" or production secrets to GitHub.»

5. Start the development server

npm run dev

Open:

http://localhost:3000

---

🚀 Production Build

Create a production build:

npm run build

Start the production server:

npm start

---

☁️ Deployment

TradMart is deployed using Vercel.

Live Application

https://trad-mart.vercel.app/

Repository

https://github.com/alshaykh27/TradMart

---

📁 Project Highlights

Area| Implementation
Framework| Next.js
UI| React + Tailwind CSS
Language| TypeScript
Database| Supabase
Animation| Framer Motion
3D| Three.js / React Three Fiber
Validation| Zod
Sanitization| sanitize-html
Testing| Node Test Runner
Deployment| Vercel
Version Control| Git / GitHub

---

🎯 Project Goals

TradMart was designed with several goals in mind:

- Build a production-oriented marketplace foundation
- Create a scalable frontend architecture
- Connect the interface to real database-driven content
- Provide centralized application management
- Support multilingual experiences
- Maintain reusable and maintainable components
- Provide a responsive experience across devices

---

👨‍💻 Author

Mohamed Khamis

Full-Stack .NET Developer

Building modern web applications and continuously expanding across frontend, backend, APIs, databases, and software architecture.

<br/><a href="https://github.com/alshaykh27">
<img src="https://img.shields.io/badge/GitHub-alshaykh27-181717?style=for-the-badge&logo=github&logoColor=white"/>
</a><a href="https://www.linkedin.com/in/mohamed-khamis-hassen-370054221">
<img src="https://img.shields.io/badge/LinkedIn-Mohamed%20Khamis-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white"/>
</a>---

<div align="center">⭐ If you find this project interesting, consider giving it a star!

<br/>Built with Next.js, React, TypeScript & Supabase

</div>
