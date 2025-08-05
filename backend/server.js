// Import required modules
const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');  // <-- session middleware

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

dotenv.config();

const app = express();
const db = require('./db');

// Middleware
app.use(cors({
  origin: 'http://localhost:3000', // or your frontend origin
  credentials: true
}));
app.use(express.json());

// Setup express-session
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',  // set a secure secret in .env
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  // No session — redirect to login
  if (!req.session.user) {
    return res.redirect('/login');
  }

  // If admin — redirect to dashboard
  if (req.session.user.role === 'admin') {
    return res.redirect('/dashboard');
  }

  // If student — serve homepage
  res.sendFile(path.join(__dirname, '../frontend/home.html'));
});


app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/signup.html'));
});

// Sample API to get names and surnames
app.get('/rs', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT name, surname FROM users');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /signup - user registration
app.post('/signup', async (req, res) => {
  const {
    name,
    surname,
    email,
    confirmEmail,
    password,
    confirmPassword,
    phone,
    dob,
    gender,
    address,
    class: studentClass
  } = req.body;

  console.log(req.body);

  // Validate required fields
  if (!name || !surname || !email || !confirmEmail || !password || !confirmPassword || !phone || !dob || !gender || !address || !studentClass) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Validate email match
  if (email !== confirmEmail) {
    return res.status(400).json({ error: 'Emails do not match' });
  }

  // Validate password match
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (password.length < 1) {
    return res.status(400).json({ error: 'Password must be at least 1 character long' });
  }

  try {
    // Insert into database
    const [result] = await db.execute(
      'INSERT INTO users (name, surname, email, password, phone_number, date_of_birth, gender, address, class_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, surname, email, password, phone, dob, gender, address, studentClass]
    );

    if (result.affectedRows === 1) {
      return res.json({
        message: 'User registered successfully',
        redirect: '/login'
      });
    } else {
      return res.status(500).json({ error: 'Insert failed' });
    }
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /login - user login and session creation
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Query user by email, password, and get role
    const [rows] = await db.execute(
      'SELECT user_id, name, surname, email, role FROM users WHERE email = ? AND password = ?',
      [email, password]
    );

    if (rows.length === 1) {
      const user = rows[0];

      // Create session user object
      req.session.user = {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role
      };

      // Determine redirect based on role
      let redirectUrl = '/';
      if (user.role === 'admin') {
        redirectUrl = '/dashboard';
      }

      return res.json({
        message: 'Login successful',
        user: req.session.user,
        redirect: redirectUrl
      });
    } else {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
  } catch (err) {
    console.error('Login DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// GET /logout - destroy session 
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// Protected route example (optional)
app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.sendFile(path.join(__dirname, '../frontend/admindashboard.html')); // Assuming this is your admin page 
});

// GET /me - Get current logged-in user details
app.get('/me', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT 
         name, surname, email, phone_number AS phone, 
         date_of_birth AS dob, gender, address, 
         class_id AS class, dormitory_id, status 
       FROM users 
       WHERE user_id = ?`,
      [req.session.user.user_id]
    );

    if (rows.length === 1) {
      return res.json(rows[0]);
    } else {
      return res.status(404).json({ error: 'User not found' });
    }
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});


// GET /subjects - mock subjects for now
app.get('/subjects', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

  const sampleSubjects = [
    "📖 English", "🔢 Mathematics", "⚛️ Physics", "🧪 Chemistry", "💰 Economics"
  ];
  res.json(sampleSubjects);
});

// GET /dormitory - example assigned hostel
app.get('/dormitory', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

  const assignedHostel = 3; // later pull from DB if needed
  res.json({ assignedHostel });
});


// Define port
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

