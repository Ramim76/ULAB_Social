const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

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

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|ppt|pptx|txt|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, documents, and archives are allowed'));
    }
  }
});

// Database initialization
db.serialize(() => {
  // First, create departments table (needed for foreign keys)
  db.run(`CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert default departments first
  db.run(`INSERT OR IGNORE INTO departments (name, code, description) VALUES 
    ('Computer Science & Engineering', 'CSE', 'Department of Computer Science and Engineering'),
    ('Business Administration', 'BBA', 'Department of Business Administration'),
    ('Electrical & Electronic Engineering', 'EEE', 'Department of Electrical and Electronic Engineering'),
    ('English & Humanities', 'ENH', 'Department of English and Humanities'),
    ('Media Studies & Journalism', 'MSJ', 'Department of Media Studies and Journalism'),
    ('Economics', 'ECO', 'Department of Economics'),
    ('General', 'GEN', 'General/Cross-departmental')
  `);

  // Create or update users table
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

  // Add new columns to users table if they don't exist
  db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student'`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN department_id INTEGER`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN student_id TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN year_of_study INTEGER`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN bio TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN profile_picture TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});

  // Create or update posts table
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

  // Add new columns to posts table if they don't exist
  db.run(`ALTER TABLE posts ADD COLUMN post_type TEXT DEFAULT 'general'`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN department_id INTEGER`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN course_code TEXT`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN category TEXT`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN priority TEXT DEFAULT 'normal'`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN is_announcement BOOLEAN DEFAULT 0`, () => {});

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

  // Insert demo data
  setTimeout(() => {
    insertDemoData();
  }, 1000);
});

// Function to insert comprehensive demo data
async function insertDemoData() {
  // Demo users with properly hashed passwords
  const password123Hash = await bcrypt.hash('password123', 10);
  const demoPassword = await bcrypt.hash('demo123', 10);
  
  const demoUsers = [
    { username: 'fahim_ahmed', email: 'fahim.ahmed@ulab.edu.bd', password: password123Hash, role: 'student', department_id: 1, student_id: 'CSE2101001', year_of_study: 3 },
    { username: 'dr_rahman', email: 'dr.rahman@ulab.edu.bd', password: password123Hash, role: 'faculty', department_id: 1, student_id: null, year_of_study: null },
    { username: 'sarah_khan', email: 'sarah.khan@ulab.edu.bd', password: password123Hash, role: 'student', department_id: 2, student_id: 'BBA2101015', year_of_study: 2 },
    { username: 'prof_islam', email: 'prof.islam@ulab.edu.bd', password: password123Hash, role: 'faculty', department_id: 3, student_id: null, year_of_study: null },
    { username: 'admin_office', email: 'admin@ulab.edu.bd', password: demoPassword, role: 'staff', department_id: 7, student_id: null, year_of_study: null }
  ];

  demoUsers.forEach(user => {
    db.run(`INSERT OR IGNORE INTO users (username, email, password, role, department_id, student_id, year_of_study) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`, 
            [user.username, user.email, user.password, user.role, user.department_id, user.student_id, user.year_of_study]);
  });

  // Demo posts
  const demoPosts = [
    {
      user_id: 1, content: '🚀 Looking for study partners for CSE213 (Data Structures)! We can work together on assignments and prepare for the upcoming midterm. Anyone interested?', 
      post_type: 'discussion', department_id: 1, course_code: 'CSE213', category: 'study-group', priority: 'normal'
    },
    {
      user_id: 2, content: '📢 IMPORTANT: CSE213 Midterm exam has been rescheduled to March 25th, 2024. Please check the updated syllabus on the course portal. Office hours available this week.', 
      post_type: 'announcement', department_id: 1, course_code: 'CSE213', category: 'exam', priority: 'high', is_announcement: 1
    },
    {
      user_id: 3, content: '💼 Exciting internship opportunity at ABC Tech! They are looking for Business Administration students for their marketing department. Great learning experience!', 
      post_type: 'general', department_id: 2, course_code: null, category: 'job', priority: 'normal'
    },
    {
      user_id: 1, content: '📚 Sharing my notes for CSE111 (Programming Language I). These cover all topics from variables to functions. Hope it helps fellow students!', 
      post_type: 'resource', department_id: 1, course_code: 'CSE111', category: 'assignment', priority: 'normal'
    },
    {
      user_id: 4, content: '⚡ Workshop on "Circuit Design Fundamentals" this Friday at 2 PM in EEE Lab. All EEE students are welcome. Refreshments will be provided!', 
      post_type: 'event', department_id: 3, course_code: null, category: 'club', priority: 'normal'
    },
    {
      user_id: 2, content: '🤝 Offering mentorship for junior CSE students struggling with programming concepts. I specialize in Java, Python, and Data Structures. DM me!', 
      post_type: 'mentorship', department_id: 1, course_code: null, category: 'other', priority: 'normal'
    },
    {
      user_id: 5, content: '📢 Important University Announcement\n\nCourse registration for Spring 2024 semester starts tomorrow. Please check your email for detailed instructions and deadlines. Contact the registrar office for any queries.', 
      post_type: 'announcement', department_id: 7, course_code: null, category: 'other', priority: 'high', is_announcement: 1
    },
    {
      user_id: 3, content: '🎯 Starting a Business Plan Competition team! Looking for creative minds from different departments. Prize money is 50,000 BDT. Who\'s in?', 
      post_type: 'general', department_id: 2, course_code: null, category: 'project', priority: 'normal'
    },
    {
      user_id: 4, content: '📢 EEE Department Notice\n\nAll EEE students must complete their lab work before the final examination. Lab sessions are available Monday to Thursday from 2 PM to 5 PM. Please bring your student ID.', 
      post_type: 'announcement', department_id: 3, course_code: null, category: 'other', priority: 'high', is_announcement: 1
    },
    {
      user_id: 2, content: '📢 CSE Seminar Alert\n\nSpecial seminar on "AI and Machine Learning Trends" scheduled for March 30th, 2024 at 10 AM in Room 301. All CSE students and faculty are invited. Refreshments will be served.', 
      post_type: 'announcement', department_id: 1, course_code: null, category: 'other', priority: 'normal', is_announcement: 1
    }
  ];

  demoPosts.forEach(post => {
    db.run(`INSERT OR IGNORE INTO posts (user_id, content, post_type, department_id, course_code, category, priority, is_announcement, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-' || CAST(ABS(RANDOM() % 168) AS TEXT) || ' hours'))`, 
            [post.user_id, post.content, post.post_type, post.department_id, post.course_code, post.category, post.priority, post.is_announcement || 0]);
  });

  // Demo events
  const demoEvents = [
    {
      title: '🎓 ULAB Tech Fest 2024',
      description: 'Annual technology festival featuring programming contests, robotics competitions, and tech exhibitions. Open to all departments!',
      event_type: 'festival',
      department_id: 1,
      organizer_id: 2,
      event_date: '2024-04-15 10:00:00',
      location: 'ULAB Main Campus',
      is_public: 1
    },
    {
      title: '💼 Career Fair Spring 2024',
      description: 'Meet with top employers and explore internship and job opportunities. Dress professionally and bring your resume!',
      event_type: 'career',
      department_id: 7,
      organizer_id: 5,
      event_date: '2024-03-28 09:00:00',
      location: 'ULAB Auditorium',
      is_public: 1
    },
    {
      title: '🔬 Research Symposium',
      description: 'Present your research projects and learn about ongoing faculty research. Great networking opportunity!',
      event_type: 'academic',
      department_id: 1,
      organizer_id: 2,
      event_date: '2024-04-10 14:00:00',
      location: 'Conference Hall A',
      is_public: 1
    },
    {
      title: '🎨 Cultural Night 2024',
      description: 'Showcase your talents in music, dance, drama, and poetry. Registration deadline: March 20th',
      event_type: 'cultural',
      department_id: 4,
      organizer_id: 1,
      event_date: '2024-04-05 18:00:00',
      location: 'ULAB Auditorium',
      is_public: 1
    }
  ];

  demoEvents.forEach(event => {
    db.run(`INSERT OR IGNORE INTO events (title, description, event_type, department_id, organizer_id, event_date, location, is_public) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
            [event.title, event.description, event.event_type, event.department_id, event.organizer_id, event.event_date, event.location, event.is_public]);
  });

  // Demo resources
  const demoResources = [
    {
      title: '📖 CSE213 Data Structures Complete Notes',
      description: 'Comprehensive notes covering Arrays, Linked Lists, Stacks, Queues, Trees, and Graphs with examples and practice problems.',
      resource_type: 'notes',
      file_url: '#demo-file-1',
      course_code: 'CSE213',
      department_id: 1,
      uploader_id: 2,
      is_approved: 1
    },
    {
      title: '💻 Java Programming Tutorial Videos',
      description: 'Step-by-step video tutorials for beginners covering basic syntax, OOP concepts, and common programming patterns.',
      resource_type: 'video',
      file_url: '#demo-file-2',
      course_code: 'CSE111',
      department_id: 1,
      uploader_id: 1,
      is_approved: 1
    },
    {
      title: '📊 Business Statistics Formula Sheet',
      description: 'Quick reference sheet with all important formulas for descriptive and inferential statistics used in business analysis.',
      resource_type: 'reference',
      file_url: '#demo-file-3',
      course_code: 'BBA201',
      department_id: 2,
      uploader_id: 3,
      is_approved: 1
    },
    {
      title: '⚡ Circuit Analysis Lab Manual',
      description: 'Laboratory manual with detailed procedures for basic and advanced circuit analysis experiments.',
      resource_type: 'manual',
      file_url: '#demo-file-4',
      course_code: 'EEE201',
      department_id: 3,
      uploader_id: 4,
      is_approved: 1
    },
    {
      title: '📝 Academic Writing Guidelines',
      description: 'Comprehensive guide for academic writing including citation formats, essay structure, and research methodology.',
      resource_type: 'guide',
      file_url: '#demo-file-5',
      course_code: null,
      department_id: 4,
      uploader_id: 5,
      is_approved: 1
    }
  ];

  demoResources.forEach(resource => {
    db.run(`INSERT OR IGNORE INTO resources (title, description, resource_type, file_url, course_code, department_id, uploader_id, is_approved) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
            [resource.title, resource.description, resource.resource_type, resource.file_url, resource.course_code, resource.department_id, resource.uploader_id, resource.is_approved]);
  });

  // Demo academic calendar
  const demoCalendar = [
    {
      title: '📚 Spring 2024 Semester Begins',
      description: 'First day of classes for Spring 2024 semester. All students must attend orientation.',
      event_type: 'semester',
      start_date: '2024-01-15',
      end_date: '2024-01-15',
      department_id: null,
      is_important: 1,
      created_by: 5
    },
    {
      title: '📝 Midterm Examination Period',
      description: 'Midterm exams for all courses. Check individual course schedules for specific dates and times.',
      event_type: 'examination',
      start_date: '2024-03-18',
      end_date: '2024-03-25',
      department_id: null,
      is_important: 1,
      created_by: 5
    },
    {
      title: '🏖️ Spring Break',
      description: 'No classes scheduled. Campus facilities remain open with limited hours.',
      event_type: 'break',
      start_date: '2024-04-01',
      end_date: '2024-04-07',
      department_id: null,
      is_important: 0,
      created_by: 5
    },
    {
      title: '📋 Course Registration - Fall 2024',
      description: 'Online course registration opens for Fall 2024 semester. Priority given to senior students.',
      event_type: 'registration',
      start_date: '2024-04-15',
      end_date: '2024-04-25',
      department_id: null,
      is_important: 1,
      created_by: 5
    },
    {
      title: '🎓 Final Examination Period',
      description: 'Final exams for Spring 2024 semester. Students must check exam schedules on student portal.',
      event_type: 'examination',
      start_date: '2024-05-20',
      end_date: '2024-05-30',
      department_id: null,
      is_important: 1,
      created_by: 5
    },
    {
      title: '🏆 Convocation 2024',
      description: 'Graduation ceremony for completing students. Family and friends are welcome to attend.',
      event_type: 'ceremony',
      start_date: '2024-06-15',
      end_date: '2024-06-15',
      department_id: null,
      is_important: 1,
      created_by: 5
    }
  ];

  demoCalendar.forEach(event => {
    db.run(`INSERT OR IGNORE INTO academic_calendar (title, description, event_type, start_date, end_date, department_id, is_important, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
            [event.title, event.description, event.event_type, event.start_date, event.end_date, event.department_id, event.is_important, event.created_by]);
  });

  // Demo post tags
  const demoTags = [
    { post_id: 1, tag: 'study-group' },
    { post_id: 1, tag: 'cse213' },
    { post_id: 1, tag: 'midterm' },
    { post_id: 2, tag: 'important' },
    { post_id: 2, tag: 'exam-schedule' },
    { post_id: 3, tag: 'internship' },
    { post_id: 3, tag: 'marketing' },
    { post_id: 4, tag: 'programming' },
    { post_id: 4, tag: 'notes' },
    { post_id: 5, tag: 'workshop' },
    { post_id: 5, tag: 'eee' },
    { post_id: 6, tag: 'mentorship' },
    { post_id: 6, tag: 'programming-help' }
  ];

  demoTags.forEach(tag => {
    db.run(`INSERT OR IGNORE INTO post_tags (post_id, tag) VALUES (?, ?)`, [tag.post_id, tag.tag]);
  });

  // Demo likes and comments
  setTimeout(() => {
    // Add some likes
    db.run(`INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (2, 1)`);
    db.run(`INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (3, 1)`);
    db.run(`INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (1, 2)`);
    db.run(`INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (3, 3)`);
    
    // Add some comments
    db.run(`INSERT OR IGNORE INTO comments (user_id, post_id, content, created_at) VALUES (2, 1, 'Count me in! I need help with linked lists.', datetime('now', '-2 hours'))`);
    db.run(`INSERT OR IGNORE INTO comments (user_id, post_id, content, created_at) VALUES (3, 1, 'Great idea! Let me know the meeting time.', datetime('now', '-1 hour'))`);
    db.run(`INSERT OR IGNORE INTO comments (user_id, post_id, content, created_at) VALUES (1, 2, 'Thank you for the update, Professor!', datetime('now', '-30 minutes'))`);
  }, 500);

  console.log('📊 Demo data inserted successfully!');
}

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
  
  // Always get departments for both logged in and non-logged in users (needed for registration)
  const departments = await new Promise((resolve) => {
    db.all('SELECT * FROM departments ORDER BY name', (err, deps) => {
      resolve(err ? [] : deps);
    });
  });
  
  res.render('index', { posts, user: req.session.user, departments, filters: req.query });
});

app.get('/profile', isAuthenticated, async (req, res) => {
  const posts = await getUserPosts(req.session.userId);
  const departments = await new Promise((resolve) => {
    db.all('SELECT * FROM departments ORDER BY name', (err, deps) => {
      resolve(err ? [] : deps);
    });
  });
  res.render('profile', { posts, user: req.session.user, departments });
});

// Update profile
app.post('/update-profile', isAuthenticated, (req, res) => {
  const { username, bio, student_id, year_of_study, department_id } = req.body;
  const userId = req.session.userId;
  
  db.run(`UPDATE users SET username = ?, bio = ?, student_id = ?, year_of_study = ?, department_id = ? WHERE id = ?`, 
          [username, bio, student_id, year_of_study, department_id, userId], 
          function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error updating profile' });
    }
    
    // Update session data
    req.session.user.username = username;
    req.session.user.bio = bio;
    req.session.user.student_id = student_id;
    req.session.user.year_of_study = year_of_study;
    req.session.user.department_id = department_id;
    
    // Get updated department info
    db.get('SELECT name as department_name, code as department_code FROM departments WHERE id = ?', 
           [department_id], (err, dept) => {
      if (dept) {
        req.session.user.department_name = dept.department_name;
        req.session.user.department_code = dept.department_code;
      }
      res.json({ success: true, message: 'Profile updated successfully' });
    });
  });
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
  
  // Validate ULAB email
  if (!email.endsWith('@ulab.edu.bd')) {
    return res.status(400).json({ error: 'Only ULAB email addresses (@ulab.edu.bd) are allowed' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, email, password, role, department_id, student_id, year_of_study) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`, 
            [username, email, hashedPassword, role || 'student', department_id || null, student_id || null, year_of_study || null], 
            function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error registering user. Username or email might already exist.' });
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
  const { username, password } = req.body;
  db.get(`SELECT u.*, d.name as department_name, d.code as department_code 
          FROM users u 
          LEFT JOIN departments d ON u.department_id = d.id 
          WHERE u.username = ?`, [username], async (err, user) => {
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

// Share resource with file upload
app.post('/share-resource', isAuthenticated, upload.single('resource_file'), (req, res) => {
  const { title, description, resource_type, file_url, course_code, department_id } = req.body;
  const uploaderId = req.session.userId;
  
  // Use uploaded file path or provided URL
  let finalFileUrl = file_url;
  if (req.file) {
    finalFileUrl = '/uploads/' + req.file.filename;
  }
  
  db.run(`INSERT INTO resources (title, description, resource_type, file_url, course_code, department_id, uploader_id) 
          VALUES (?, ?, ?, ?, ?, ?, ?)`, 
          [title, description, resource_type, finalFileUrl, course_code, department_id, uploaderId], 
          (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error sharing resource' });
    }
    res.json({ success: true, message: 'Resource shared successfully' });
  });
});

// File upload endpoint for general use
app.post('/upload-file', isAuthenticated, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({ 
    success: true, 
    filename: req.file.filename,
    originalname: req.file.originalname,
    path: '/uploads/' + req.file.filename,
    size: req.file.size
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

// Create announcement (special post type)
app.post('/create-announcement', isAuthenticated, (req, res) => {
  const { title, content, department_id, priority, event_date, location } = req.body;
  const userId = req.session.userId;
  
  // Only faculty and staff can create announcements
  if (req.session.user.role !== 'faculty' && req.session.user.role !== 'staff') {
    return res.status(403).json({ error: 'Only faculty and staff can create announcements' });
  }
  
  const fullContent = title ? `📢 ${title}\n\n${content}` : content;
  const createdAt = new Date().toISOString();
  
  db.run(`INSERT INTO posts (user_id, content, post_type, department_id, priority, is_announcement, created_at) 
          VALUES (?, ?, 'announcement', ?, ?, 1, ?)`, 
          [userId, fullContent, department_id, priority || 'high', createdAt], 
          function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error creating announcement' });
    }
    
    // If it's an event announcement, also add to events table
    if (event_date && location) {
      db.run(`INSERT INTO events (title, description, event_type, department_id, organizer_id, event_date, location, is_public) 
              VALUES (?, ?, 'announcement', ?, ?, ?, ?, 1)`, 
              [title, content, department_id, userId, event_date, location]);
    }
    
    res.json({ success: true, message: 'Announcement created successfully' });
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

