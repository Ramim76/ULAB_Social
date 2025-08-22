async function toggleLike(postId) {
    const likeButton = document.querySelector(`#post-${postId} .like-button`);
    const likesCountSpan = likeButton.querySelector('.likes-count');
    const likesListDiv = document.getElementById(`likes-${postId}`);
    const isLiked = likeButton.classList.contains('liked');
    
    try {
        const response = await fetch(isLiked ? '/unlike-post' : '/like-post', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ postId }),
        });
        const data = await response.json();
        if (data.success) {
            likesCountSpan.textContent = data.likes.length;
            likeButton.classList.toggle('liked');
            updateLikesList(likesListDiv, data.likes);
        }
    } catch (error) {
        console.error('Error liking/unliking post:', error);
    }
}

function updateLikesList(likesListDiv, likes) {
    likesListDiv.innerHTML = likes.length > 0
        ? `Liked by: ${likes.map(like => like.username).join(', ')}`
        : '';
}

async function toggleComments(postId) {
    const commentsSection = document.getElementById(`comments-section-${postId}`);
    const isHidden = commentsSection.style.display === 'none';
    
    if (isHidden) {
        commentsSection.style.display = 'block';
        await loadComments(postId);
    } else {
        commentsSection.style.display = 'none';
    }
}

async function loadComments(postId) {
    try {
        const response = await fetch(`/get-comments/${postId}`);
        const comments = await response.json();
        const commentsContainer = document.getElementById(`comments-${postId}`);
        commentsContainer.innerHTML = '';
        comments.forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.className = 'comment';
            commentElement.innerHTML = `<strong>${comment.username}:</strong> ${comment.content}`;
            commentsContainer.appendChild(commentElement);
        });
    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

async function commentPost(postId) {
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const content = commentInput.value.trim();
    if (!content) return;

    try {
        const response = await fetch('/comment-post', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ postId, content }),
        });
        const data = await response.json();
        if (data.success) {
            const commentsContainer = document.getElementById(`comments-${postId}`);
            const commentElement = document.createElement('div');
            commentElement.className = 'comment';
            commentElement.innerHTML = `<strong>${data.comment.username}:</strong> ${data.comment.content}`;
            commentsContainer.insertBefore(commentElement, commentsContainer.firstChild);
            commentInput.value = '';

            // Update comment count
            const commentsCountSpan = document.querySelector(`#post-${postId} .comments-count`);
            commentsCountSpan.textContent = parseInt(commentsCountSpan.textContent) + 1;
        }
    } catch (error) {
        console.error('Error commenting on post:', error);
    }
}

async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
        const response = await fetch('/delete-post', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ postId }),
        });
        const data = await response.json();
        if (data.success) {
            const postElement = document.getElementById(`post-${postId}`);
            postElement.remove();
        }
    } catch (error) {
        console.error('Error deleting post:', error);
    }
}

// Load likes for each post
document.addEventListener('DOMContentLoaded', () => {
    const posts = document.querySelectorAll('.post');
    posts.forEach(post => {
        const postId = post.id.split('-')[1];
        loadLikes(postId);
    });
});

async function loadLikes(postId) {
    try {
        const response = await fetch(`/get-likes/${postId}`);
        const likes = await response.json();
        const likesListDiv = document.getElementById(`likes-${postId}`);
        updateLikesList(likesListDiv, likes);
    } catch (error) {
        console.error('Error loading likes:', error);
    }
}

