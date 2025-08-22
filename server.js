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
  db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, email TEXT UNIQUE, password TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT, created_at DATETIME)");
  db.run("CREATE TABLE IF NOT EXISTS likes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, post_id INTEGER, UNIQUE(user_id, post_id))");
  db.run("CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, post_id INTEGER, content TEXT, created_at DATETIME)");
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
  const posts = await getPosts();
  res.render('index', { posts, user: req.session.user });
});

app.get('/profile', isAuthenticated, async (req, res) => {
  const posts = await getUserPosts(req.session.userId);
  res.render('profile', { posts, user: req.session.user });
});

app.get('/post', isAuthenticated, (req, res) => {
  res.render('post', { user: req.session.user });
});

// User registration
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error registering user' });
      }
      req.session.userId = this.lastID;
      req.session.user = { id: this.lastID, username, email };
      res.redirect('/profile');
    });
  } catch (error) {
    res.status(500).json({ error: 'Error registering user' });
  }
});

// User login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    try {
      if (await bcrypt.compare(password, user.password)) {
        req.session.userId = user.id;
        req.session.user = { id: user.id, username: user.username, email: user.email };
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
  const { content } = req.body;
  const userId = req.session.userId;
  const createdAt = new Date().toISOString();
  
  db.run('INSERT INTO posts (user_id, content, created_at) VALUES (?, ?, ?)', [userId, content, createdAt], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error creating post' });
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
function getPosts() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        p.id, p.content, p.created_at, u.username, u.id as user_id,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `, (err, rows) => {
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
        p.id, p.content, p.created_at,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count
      FROM posts p
      WHERE p.user_id = ?
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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

