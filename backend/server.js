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
    class: studentClass,
    selectedSubjects // This should be an array of subject names like ["Math", "English"]
  } = req.body;

  console.log(req.body);

  // Validation
  if (!name || !surname || !email || !confirmEmail || !password || !confirmPassword || !phone || !dob || !gender || !address || !studentClass || !selectedSubjects) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (email !== confirmEmail) {
    return res.status(400).json({ error: 'Emails do not match' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (password.length < 1) {
    return res.status(400).json({ error: 'Password must be at least 1 character long' });
  }

  try {
    // 1. Insert user into users table
    const [userResult] = await db.execute(
      'INSERT INTO users (name, surname, email, password, phone_number, date_of_birth, gender, address, class_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, surname, email, password, phone, dob, gender, address, studentClass]
    );

    if (userResult.affectedRows !== 1) {
      return res.status(500).json({ error: 'User insert failed' });
    }

    const userId = userResult.insertId;

    // 2. Get subject IDs from subject names
    const placeholders = selectedSubjects.map(() => '?').join(', ');
    const [subjectRows] = await db.execute(
      `SELECT subject_id FROM subjects WHERE subject_name IN (${placeholders})`,
      selectedSubjects
    );

    // 3. Insert into student_subjects (user_id, subject_id)
    if (subjectRows.length > 0) {
      const studentSubjectsValues = subjectRows.map(row => [userId, row.subject_id]);

      await db.query(
        'INSERT INTO student_subjects (user_id, subject_id) VALUES ?',
        [studentSubjectsValues]
      );
    }

    return res.json({
      message: 'User registered successfully',
      redirect: '/login'
    });

  } catch (err) {
    console.error('DB Error:', err);
    return res.status(500).json({ error: 'Database error' });
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
    const userId = req.session.user.user_id;

    // 1. Get user info
    const [userRows] = await db.execute(
      `SELECT 
         name, surname, email, phone_number AS phone, 
         date_of_birth AS dob, gender, address, 
         class_id AS class, dormitory_id, status 
       FROM users 
       WHERE user_id = ?`,
      [userId]
    );

    if (userRows.length !== 1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userRows[0];

    // 2. Get subjects for this user
    const [subjectRows] = await db.execute(
      `SELECT s.subject_name 
       FROM student_subjects ss
       JOIN subjects s ON ss.subject_id = s.subject_id
       WHERE ss.user_id = ?`,
      [userId]
    );

    const subjects = subjectRows.map(row => row.subject_name); // Array of subject names

    // 3. Include subjects in response
    return res.json({
      ...userData,
      subjects
    });

  } catch (err) {
    console.error('Error fetching user profile:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// api for getting the add subject API
app.get('/add-subject', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.sendFile(path.join(__dirname, '../frontend/addsubject.html'));
});


// GET /subjects
app.get('/subjects', async (req, res) => {
  /*
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }*/

  const sql = `
    SELECT subject_name AS subject FROM subjects
  `;

  try {
    const [rows] = await db.query(sql);
    return res.json(rows); // Return after sending the response
  } catch (err) {
    console.error('Error fetching subjects:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});



// 1. Get all students (role='student')
app.get('/students', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

  const sql = `
    SELECT u.user_id, u.name, u.surname, u.gender, c.class_name, d.dormitory_name, u.status
    FROM users u
    LEFT JOIN classes c ON u.class_id = c.class_id
    LEFT JOIN dormitories d ON u.dormitory_id = d.dormitory_id
    WHERE u.role = 'student'
  `;

  try {
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 2. Get active students (status = 'active')
app.get('/students/active', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

  const sql = `SELECT user_id, name, surname, gender, status FROM users WHERE role='student' AND status='active'`;

  try {
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching active students:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 3. Get inactive students (status = 'denied')
app.get('/students/inactive', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

  const sql = `SELECT user_id, name, surname, gender, status FROM users WHERE role='student' AND status='denied'`;

  try {
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching inactive students:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 4. Get student stats
app.get('/students/stats', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

  const sql = `
    SELECT 
      COUNT(*) AS total,
      SUM(gender = 'Male') AS male,
      SUM(gender = 'Female') AS female,
      SUM(status = 'active') AS active,
      SUM(status = 'denied') AS inactive
    FROM users WHERE role = 'student'
  `;

  try {
    const [rows] = await db.query(sql);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching student stats:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 5. Get all subjects
app.get('/subjects', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

  const sql = `SELECT subject_id, subject_name FROM subjects`;

  try {
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching subjects:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 6. Get dormitory students
app.get('/dormitory', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

  const sql = `
    SELECT u.user_id, u.name, u.surname, u.dormitory_id 
    FROM users u
    WHERE u.role = 'student'
  `;

  try {
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching dormitory students:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/submit-subject', (req, res) => {

  const { subject } = req.body;

  if (!subject || typeof subject !== 'string') {
    return res.status(400).json({ message: 'Invalid subject' });
  }

  const insertQuery = 'INSERT INTO subjects (subject_name) VALUES (?)';

  db.query(insertQuery, [subject], (err, results) => {
    if (err) {
      console.error('Database error while inserting subject:', err);
      return res.status(500).json({ message: 'Database error' });
    }
    console.log("Subject to insert:", subject);


return res.status(200).json({ message: 'Subject submitted successfully' });
  });
});


// Define port
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

