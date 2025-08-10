# Medical Sterilization Unit (MSU) Management System

A comprehensive web-based system for managing medical instrument sterilization processes, inventory tracking, and workflow management across different departments in healthcare facilities.

## 🏥 Overview

The MSU Management System streamlines the entire lifecycle of medical instruments from registration to sterilization, storage, and deployment across different departments. It provides role-based access control and real-time tracking capabilities with QR code integration.

## ✨ Key Features

- **Inventory Management**: Track medical instruments with unique IDs and QR codes
- **Sterilization Process**: Multi-step sterilization workflow with status tracking
- **Group Management**: Batch processing of instruments in groups
- **Department Forwarding**: Inter-department transfer requests and approvals
- **Storage System**: Physical location tracking with grid-based storage
- **Role-Based Access**: Different interfaces for Admin, MSU, Storage, and Surgery personnel
- **QR Code Integration**: Scan instruments and groups for quick access
- **Export Capabilities**: Generate PDF and Excel reports
- **Audit Trail**: Complete history tracking of all actions

## 🏗️ System Architecture

### Frontend
- **React 19** with TypeScript
- **Vite** for build tooling
- **QR Code** scanning and generation
- **Responsive design** with custom CSS

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **Sequelize ORM** with MySQL
- **JWT Authentication**
- **RESTful API** design

### Database
- **MySQL** database
- Normalized schema with foreign key relationships
- Audit logging for all operations

## 👥 User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full system access, user management, inventory control |
| **MSU Personnel** | Sterilization processes, group management |
| **Storage Personnel** | Storage management, forwarding requests |
| **Surgery Personnel** | Receive instruments, mark as used |

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MySQL (v8.0 or higher)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd COOP
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   ```

4. **Database Setup**
   ```bash
   # Create MySQL database
   mysql -u root -p < backend/database.sql
   
   # Configure environment variables
   cp backend/.env.example backend/.env
   # Edit .env with your database credentials
   ```

5. **Environment Configuration**
   
   Edit `backend/.env`:
   ```env
   DB_HOST=localhost
   DB_USER=your_username
   DB_PASSWORD=your_password
   DB_NAME=medical_sterilization
   JWT_SECRET=your_jwt_secret
   PORT=3001
   ```

### Running the Application

1. **Start Backend Server**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start Frontend Development Server**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Access the Application**
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:3001`

### Default Login
- **Username**: `admin`
- **Password**: `admin123`

## 📱 Core Workflows

### 1. Instrument Registration
- Admin/MSU personnel register new instruments
- System generates unique IDs and QR codes
- Instruments start at MSU location

### 2. Group Creation
- Batch instruments into groups for processing
- Generate group QR codes for tracking
- Assign groups to specific locations

### 3. Sterilization Process
- Multi-step workflow: Hand washing → Automatic washing → Steam sterilization → Cooling → Finished
- Real-time status updates
- QR code scanning for quick access

### 4. Department Forwarding
- Request transfers between departments
- Approval/rejection workflow
- Automatic location updates

### 5. Storage Management
- Grid-based storage system (A1-J20)
- Physical location tracking
- Storage position assignment

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/users` - Get all users (Admin only)

### Items
- `GET /api/items` - Get all items with pagination
- `POST /api/items/register` - Register new items
- `PUT /api/items/bulk-status` - Update item status

### Groups
- `GET /api/groups` - Get all groups
- `POST /api/groups` - Create new group
- `DELETE /api/groups/:id` - Delete group

### Forwarding
- `GET /api/forwarding` - Get forwarding requests
- `POST /api/forwarding` - Create forwarding request
- `PUT /api/forwarding/:id/accept` - Accept request
- `PUT /api/forwarding/:id/reject` - Reject request

### History
- `GET /api/history` - Get action history with filters

### Storage
- `GET /api/storage` - Get storage locations
- `POST /api/storage` - Store item at location

## 📊 Database Schema

### Key Tables
- `users` - User accounts and roles
- `medical_items` - Individual instruments
- `instrument_groups` - Batch groupings
- `group_items` - Group membership
- `action_history` - Audit trail
- `forwarding_requests` - Inter-department transfers
- `storage_locations` - Physical storage tracking

## 🔒 Security Features

- JWT-based authentication
- Role-based access control
- Password hashing with bcrypt
- SQL injection prevention
- CORS configuration

## 📈 Monitoring & Analytics

- Complete audit trail of all actions
- Export capabilities (PDF/Excel)
- Real-time status tracking
- Performance optimization with pagination
- Background sync for data consistency

## 🛠️ Development

### Project Structure
```
COOP/
├── backend/
│   ├── src/
│   │   ├── models/     # Database models
│   │   ├── routes/     # API endpoints
│   │   ├── middleware/ # Authentication
│   │   └── server.ts   # Main server
│   └── database.sql    # Database schema
├── frontend/
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── hooks/      # Custom hooks
│   │   ├── services/   # API services
│   │   └── App.tsx     # Main application
│   └── public/
└── README.md
```

### Available Scripts

**Backend:**
- `npm run dev` - Development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server

**Frontend:**
- `npm run dev` - Development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🚀 Deployment

### Production Build
```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
# Serve dist/ folder with web server
```

### Environment Variables
Ensure all production environment variables are properly configured:
- Database connection settings
- JWT secret key
- CORS origins
- Port configurations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:
- Check the documentation
- Review the API endpoints
- Examine the database schema
- Test with the default admin account

## 🔄 Version History

- **v1.0.0** - Initial release with core functionality
- Role-based access control
- QR code integration
- Multi-step sterilization workflow
- Department forwarding system
- Storage management
- Comprehensive audit trail

---

**Note**: This system is designed for healthcare environments and should be deployed with appropriate security measures and compliance considerations for medical data handling.