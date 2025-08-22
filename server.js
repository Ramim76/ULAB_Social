const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./db.sqlite');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database initialization
db.serialize(() => {
  // Enhanced Users table with role and department
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    username TEXT UNIQUE, 
    email TEXT UNIQUE, 
    password TEXT,
    role TEXT DEFAULT 'student',
    department_id INTEGER,
    student_id TEXT,
    year_of_study INTEGER,
    bio TEXT,
    profile_picture TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
  )`);

  // Departments table
  db.run(`CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Enhanced Posts table with categories and tags
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    user_id INTEGER, 
    content TEXT, 
    post_type TEXT DEFAULT 'general',
    department_id INTEGER,
    course_code TEXT,
    category TEXT,
    priority TEXT DEFAULT 'normal',
    is_announcement BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (department_id) REFERENCES departments(id)
  )`);

  // Post Tags table (many-to-many relationship)
  db.run(`CREATE TABLE IF NOT EXISTS post_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    tag TEXT,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    UNIQUE(post_id, tag)
  )`);

  // Courses table
  db.run(`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    department_id INTEGER,
    semester TEXT,
    year INTEGER,
    faculty_id INTEGER,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (faculty_id) REFERENCES users(id)
  )`);

  // Events table
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT,
    department_id INTEGER,
    organizer_id INTEGER,
    event_date DATETIME,
    location TEXT,
    is_public BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (organizer_id) REFERENCES users(id)
  )`);

  // Resources table
  db.run(`CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    resource_type TEXT,
    file_path TEXT,
    file_url TEXT,
    course_code TEXT,
    department_id INTEGER,
    uploader_id INTEGER,
    is_approved BOOLEAN DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (uploader_id) REFERENCES users(id)
  )`);

  // Mentorship table
  db.run(`CREATE TABLE IF NOT EXISTS mentorship (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id INTEGER,
    mentee_id INTEGER,
    subject_area TEXT,
    status TEXT DEFAULT 'pending',
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mentor_id) REFERENCES users(id),
    FOREIGN KEY (mentee_id) REFERENCES users(id)
  )`);

  // Academic Calendar table
  db.run(`CREATE TABLE IF NOT EXISTS academic_calendar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT,
    start_date DATE,
    end_date DATE,
    department_id INTEGER,
    is_important BOOLEAN DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  // Keep existing tables with foreign key constraints
  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    user_id INTEGER, 
    post_id INTEGER, 
    UNIQUE(user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    user_id INTEGER, 
    post_id INTEGER, 
    content TEXT, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
  )`);

  // Insert default departments
  db.run(`INSERT OR IGNORE INTO departments (name, code, description) VALUES 
    ('Computer Science & Engineering', 'CSE', 'Department of Computer Science and Engineering'),
    ('Business Administration', 'BBA', 'Department of Business Administration'),
    ('Electrical & Electronic Engineering', 'EEE', 'Department of Electrical and Electronic Engineering'),
    ('English & Humanities', 'ENH', 'Department of English and Humanities'),
    ('Media Studies & Journalism', 'MSJ', 'Department of Media Studies and Journalism'),
    ('Economics', 'ECO', 'Department of Economics'),
    ('General', 'GEN', 'General/Cross-departmental')
  `);
});

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/');
  }
};

// Routes
app.get('/', async (req, res) => {
  const filters = {};
  if (req.query.department) filters.department_id = req.query.department;
  if (req.query.type) filters.post_type = req.query.type;
  if (req.query.course) filters.course_code = req.query.course;
  
  const posts = await getPosts(filters);
  const departments = await new Promise((resolve) => {
    db.all('SELECT * FROM departments ORDER BY name', (err, deps) => {
      resolve(err ? [] : deps);
    });
  });
  
  res.render('index', { posts, user: req.session.user, departments, filters: req.query });
});

app.get('/profile', isAuthenticated, async (req, res) => {
  const posts = await getUserPosts(req.session.userId);
  res.render('profile', { posts, user: req.session.user });
});

app.get('/post', isAuthenticated, async (req, res) => {
  const departments = await new Promise((resolve) => {
    db.all('SELECT * FROM departments ORDER BY name', (err, deps) => {
      resolve(err ? [] : deps);
    });
  });
  res.render('post', { user: req.session.user, departments });
});

// User registration
app.post('/register', async (req, res) => {
  const { username, email, password, role, department_id, student_id, year_of_study } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, email, password, role, department_id, student_id, year_of_study) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`, 
            [username, email, hashedPassword, role || 'student', department_id || null, student_id || null, year_of_study || null], 
            function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error registering user' });
      }
      req.session.userId = this.lastID;
      req.session.user = { id: this.lastID, username, email, role: role || 'student', department_id };
      res.redirect('/profile');
    });
  } catch (error) {
    res.status(500).json({ error: 'Error registering user' });
  }
});

// User login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT u.*, d.name as department_name, d.code as department_code 
          FROM users u 
          LEFT JOIN departments d ON u.department_id = d.id 
          WHERE u.email = ?`, [email], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    try {
      if (await bcrypt.compare(password, user.password)) {
        req.session.userId = user.id;
        req.session.user = { 
          id: user.id, 
          username: user.username, 
          email: user.email, 
          role: user.role,
          department_id: user.department_id,
          department_name: user.department_name,
          department_code: user.department_code,
          student_id: user.student_id,
          year_of_study: user.year_of_study
        };
        res.redirect('/profile');
      } else {
        res.status(400).json({ error: 'Invalid credentials' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Error logging in' });
    }
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error logging out' });
    }
    res.redirect('/');
  });
});

// Create a post
app.post('/create-post', isAuthenticated, (req, res) => {
  const { content, post_type, department_id, course_code, category, priority, tags } = req.body;
  const userId = req.session.userId;
  const createdAt = new Date().toISOString();
  
  db.run(`INSERT INTO posts (user_id, content, post_type, department_id, course_code, category, priority, created_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
          [userId, content, post_type || 'general', department_id || null, course_code || null, category || null, priority || 'normal', createdAt], 
          function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error creating post' });
    }
    
    // Add tags if provided
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      tagArray.forEach(tag => {
        db.run('INSERT OR IGNORE INTO post_tags (post_id, tag) VALUES (?, ?)', [this.lastID, tag]);
      });
    }
    
    res.redirect('/profile');
  });
});

// Like a post
app.post('/like-post', isAuthenticated, (req, res) => {
  const { postId } = req.body;
  const userId = req.session.userId;
  
  db.run('INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)', [userId, postId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error liking post' });
    }
    db.all('SELECT users.username FROM likes JOIN users ON likes.user_id = users.id WHERE likes.post_id = ?', [postId], (err, likes) => {
      if (err) {
        return res.status(500).json({ error: 'Error getting likes' });
      }
      res.json({ success: true, likes });
    });
  });
});

// Unlike a post
app.post('/unlike-post', isAuthenticated, (req, res) => {
  const { postId } = req.body;
  const userId = req.session.userId;
  
  db.run('DELETE FROM likes WHERE user_id = ? AND post_id = ?', [userId, postId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error unliking post' });
    }
    db.all('SELECT users.username FROM likes JOIN users ON likes.user_id = users.id WHERE likes.post_id = ?', [postId], (err, likes) => {
      if (err) {
        return res.status(500).json({ error: 'Error getting likes' });
      }
      res.json({ success: true, likes });
    });
  });
});

// Comment on a post
app.post('/comment-post', isAuthenticated, (req, res) => {
  const { postId, content } = req.body;
  const userId = req.session.userId;
  const createdAt = new Date().toISOString();
  
  db.run('INSERT INTO comments (user_id, post_id, content, created_at) VALUES (?, ?, ?, ?)', [userId, postId, content, createdAt], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error commenting on post' });
    }
    db.get('SELECT comments.*, users.username FROM comments JOIN users ON comments.user_id = users.id WHERE comments.id = last_insert_rowid()', (err, comment) => {
      if (err) {
        return res.status(500).json({ error: 'Error retrieving comment' });
      }
      res.json({ success: true, comment });
    });
  });
});

// Delete a post
app.post('/delete-post', isAuthenticated, (req, res) => {
  const { postId } = req.body;
  const userId = req.session.userId;

  db.run('DELETE FROM posts WHERE id = ? AND user_id = ?', [postId, userId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error deleting post' });
    }
    db.run('DELETE FROM likes WHERE post_id = ?', [postId]);
    db.run('DELETE FROM comments WHERE post_id = ?', [postId]);
    res.json({ success: true });
  });
});

// Helper function to get all posts with likes and comments
function getPosts(filters = {}) {
  return new Promise((resolve, reject) => {
    let query = `
      SELECT 
        p.id, p.content, p.post_type, p.course_code, p.category, p.priority, p.created_at,
        u.username, u.id as user_id, u.role, u.student_id,
        d.name as department_name, d.code as department_code,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
        GROUP_CONCAT(pt.tag) as tags
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (filters.department_id) {
      conditions.push('p.department_id = ?');
      params.push(filters.department_id);
    }
    
    if (filters.post_type) {
      conditions.push('p.post_type = ?');
      params.push(filters.post_type);
    }
    
    if (filters.course_code) {
      conditions.push('p.course_code = ?');
      params.push(filters.course_code);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY p.id ORDER BY p.created_at DESC';
    
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
}

// Helper function to get user's posts
function getUserPosts(userId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        p.id, p.content, p.post_type, p.course_code, p.category, p.priority, p.created_at,
        d.name as department_name, d.code as department_code,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
        GROUP_CONCAT(pt.tag) as tags
      FROM posts p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `, [userId], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
}

// Get likes for a post
app.get('/get-likes/:postId', isAuthenticated, (req, res) => {
  const { postId } = req.params;
  db.all('SELECT users.username FROM likes JOIN users ON likes.user_id = users.id WHERE likes.post_id = ?', [postId], (err, likes) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching likes' });
    }
    res.json(likes);
  });
});

// Get comments for a post
app.get('/get-comments/:postId', isAuthenticated, (req, res) => {
  const { postId } = req.params;
  db.all('SELECT comments.content, users.username FROM comments JOIN users ON comments.user_id = users.id WHERE comments.post_id = ? ORDER BY comments.created_at DESC', [postId], (err, comments) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching comments' });
    }
    res.json(comments);
  });
});

// Get departments
app.get('/api/departments', (req, res) => {
  db.all('SELECT * FROM departments ORDER BY name', (err, departments) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching departments' });
    }
    res.json(departments);
  });
});

// Filter posts by department
app.get('/posts/department/:departmentId', isAuthenticated, async (req, res) => {
  const { departmentId } = req.params;
  try {
    const posts = await getPosts({ department_id: departmentId });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching posts' });
  }
});

// Filter posts by course
app.get('/posts/course/:courseCode', isAuthenticated, async (req, res) => {
  const { courseCode } = req.params;
  try {
    const posts = await getPosts({ course_code: courseCode });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching posts' });
  }
});

// Create event
app.post('/create-event', isAuthenticated, (req, res) => {
  const { title, description, event_type, department_id, event_date, location, is_public } = req.body;
  const organizerId = req.session.userId;
  
  db.run(`INSERT INTO events (title, description, event_type, department_id, organizer_id, event_date, location, is_public) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
          [title, description, event_type, department_id, organizerId, event_date, location, is_public || 1], 
          (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error creating event' });
    }
    res.json({ success: true, message: 'Event created successfully' });
  });
});

// Get events
app.get('/api/events', isAuthenticated, (req, res) => {
  const { department_id, event_type } = req.query;
  let query = `
    SELECT e.*, u.username as organizer_name, d.name as department_name 
    FROM events e 
    JOIN users u ON e.organizer_id = u.id 
    LEFT JOIN departments d ON e.department_id = d.id 
    WHERE e.is_public = 1
  `;
  const params = [];
  
  if (department_id) {
    query += ' AND e.department_id = ?';
    params.push(department_id);
  }
  
  if (event_type) {
    query += ' AND e.event_type = ?';
    params.push(event_type);
  }
  
  query += ' ORDER BY e.event_date ASC';
  
  db.all(query, params, (err, events) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching events' });
    }
    res.json(events);
  });
});

// Share resource
app.post('/share-resource', isAuthenticated, (req, res) => {
  const { title, description, resource_type, file_url, course_code, department_id } = req.body;
  const uploaderId = req.session.userId;
  
  db.run(`INSERT INTO resources (title, description, resource_type, file_url, course_code, department_id, uploader_id) 
          VALUES (?, ?, ?, ?, ?, ?, ?)`, 
          [title, description, resource_type, file_url, course_code, department_id, uploaderId], 
          (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error sharing resource' });
    }
    res.json({ success: true, message: 'Resource shared successfully' });
  });
});

// Get resources
app.get('/api/resources', isAuthenticated, (req, res) => {
  const { department_id, course_code, resource_type } = req.query;
  let query = `
    SELECT r.*, u.username as uploader_name, d.name as department_name 
    FROM resources r 
    JOIN users u ON r.uploader_id = u.id 
    LEFT JOIN departments d ON r.department_id = d.id 
    WHERE r.is_approved = 1
  `;
  const params = [];
  
  if (department_id) {
    query += ' AND r.department_id = ?';
    params.push(department_id);
  }
  
  if (course_code) {
    query += ' AND r.course_code = ?';
    params.push(course_code);
  }
  
  if (resource_type) {
    query += ' AND r.resource_type = ?';
    params.push(resource_type);
  }
  
  query += ' ORDER BY r.created_at DESC';
  
  db.all(query, params, (err, resources) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching resources' });
    }
    res.json(resources);
  });
});

// Request mentorship
app.post('/request-mentorship', isAuthenticated, (req, res) => {
  const { mentor_id, subject_area, message } = req.body;
  const menteeId = req.session.userId;
  
  db.run(`INSERT INTO mentorship (mentor_id, mentee_id, subject_area, message) 
          VALUES (?, ?, ?, ?)`, 
          [mentor_id, menteeId, subject_area, message], 
          (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error requesting mentorship' });
    }
    res.json({ success: true, message: 'Mentorship request sent successfully' });
  });
});

// Get mentorship requests
app.get('/api/mentorship', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  
  db.all(`
    SELECT m.*, 
           mentor.username as mentor_name, mentor.role as mentor_role,
           mentee.username as mentee_name, mentee.role as mentee_role
    FROM mentorship m
    JOIN users mentor ON m.mentor_id = mentor.id
    JOIN users mentee ON m.mentee_id = mentee.id
    WHERE m.mentor_id = ? OR m.mentee_id = ?
    ORDER BY m.created_at DESC
  `, [userId, userId], (err, requests) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching mentorship requests' });
    }
    res.json(requests);
  });
});

// Add academic calendar event
app.post('/add-calendar-event', isAuthenticated, (req, res) => {
  const { title, description, event_type, start_date, end_date, department_id, is_important } = req.body;
  const createdBy = req.session.userId;
  
  // Only faculty and staff can add calendar events
  if (req.session.user.role !== 'faculty' && req.session.user.role !== 'staff') {
    return res.status(403).json({ error: 'Only faculty and staff can add calendar events' });
  }
  
  db.run(`INSERT INTO academic_calendar (title, description, event_type, start_date, end_date, department_id, is_important, created_by) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
          [title, description, event_type, start_date, end_date, department_id, is_important || 0, createdBy], 
          (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error adding calendar event' });
    }
    res.json({ success: true, message: 'Calendar event added successfully' });
  });
});

// Get academic calendar
app.get('/api/calendar', isAuthenticated, (req, res) => {
  const { department_id, event_type } = req.query;
  let query = `
    SELECT ac.*, u.username as created_by_name, d.name as department_name 
    FROM academic_calendar ac 
    JOIN users u ON ac.created_by = u.id 
    LEFT JOIN departments d ON ac.department_id = d.id 
    WHERE 1=1
  `;
  const params = [];
  
  if (department_id) {
    query += ' AND ac.department_id = ?';
    params.push(department_id);
  }
  
  if (event_type) {
    query += ' AND ac.event_type = ?';
    params.push(event_type);
  }
  
  query += ' ORDER BY ac.start_date ASC';
  
  db.all(query, params, (err, events) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching calendar events' });
    }
    res.json(events);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

