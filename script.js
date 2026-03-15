// --- Firebase Imports & Config ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCcR2pfUMuKJEWpIiGpHg6ZNVRI4yJgWZ4",
  authDomain: "mostafa-abu-taleb.firebaseapp.com",
  projectId: "mostafa-abu-taleb",
  storageBucket: "mostafa-abu-taleb.firebasestorage.app",
  messagingSenderId: "591146366995",
  appId: "1:591146366995:web:ca7f189206beecbe6a27e6",
  measurementId: "G-C5B5EF54W7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const dbFirestore = getFirestore(app);
const storage = getStorage(app);

// --- Helper: Upload File to Firebase Storage ---
async function uploadFileToStorage(file, path) {
    const storageRef = ref(storage, path + '/' + Date.now() + '_' + file.name);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
}

// --- Mobile Sidebar Logic ---
function toggleSidebar() {
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

// --- Navigation Logic ---
function switchTab(e, viewId) {
    e.preventDefault();
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-' + viewId).classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    const link = e.currentTarget.tagName === 'A' ? e.currentTarget : document.querySelector(`.nav-item[onclick*="'${viewId}'"]`);
    if(link) link.classList.add('active');

    if(window.innerWidth <= 768) {
        toggleSidebar();
    }
}

// --- Theme Switcher Logic ---
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    const icon = document.getElementById('theme-icon');
    
    icon.style.transform = "rotate(360deg) scale(0.5)";
    setTimeout(() => {
        if (isLight) {
            icon.classList.replace('fa-moon', 'fa-sun');
            localStorage.setItem('theme', 'light');
        } else {
            icon.classList.replace('fa-sun', 'fa-moon');
            localStorage.setItem('theme', 'dark');
        }
        icon.style.transform = "rotate(0deg) scale(1)";
    }, 200);
}

// Load Theme on Startup
// --- DB & Persistence (Replaced with Local Cache for Rendering) ---
let db = {
    directives: [],
    photos: [],
    lectures: [],
    tasks: [], // Added tasks to cache
    isAdmin: localStorage.getItem('isAdmin') === 'true' // Persist admin state locally for UI
};

// --- Realtime Listeners (Firestore) ---
function initRealtimeListeners() {
    // Directives Listener
    const qDirectives = query(collection(dbFirestore, "directives"), orderBy("timestamp", "asc"));
    onSnapshot(qDirectives, (snapshot) => {
        document.getElementById('directives-container').innerHTML = '<p id="no-directives" class="empty-text" style="display:none">لا توجد توجيهات جديدة.</p>';
        db.directives = [];
        snapshot.forEach((doc) => {
            const item = { id: doc.id, ...doc.data() };
            db.directives.push(item);
            createDirectiveElement(item, false);
        });
        checkEmpty('directives-container', 'no-directives');
    });

    // Photos Listener
    const qPhotos = query(collection(dbFirestore, "photos"), orderBy("timestamp", "asc"));
    onSnapshot(qPhotos, (snapshot) => {
        const container = document.getElementById('photos-container');
        // Clear but keep placeholder/empty msg logic structure
        container.innerHTML = '<div class="empty-state-msg" id="photos-empty" style="display:none">معرض الصور فارغ حالياً.</div>';
        db.photos = [];
        snapshot.forEach((doc) => {
            const item = { id: doc.id, ...doc.data() };
            db.photos.push(item);
            addImageToGallery(item, false);
        });
        checkEmpty('photos-container', 'photos-empty');
    });

    // Lectures Listener
    const qLectures = query(collection(dbFirestore, "lectures"), orderBy("timestamp", "asc"));
    onSnapshot(qLectures, (snapshot) => {
        const container = document.getElementById('lectures-container');
        container.innerHTML = '<div class="empty-state-msg" id="lectures-empty" style="display:none">لا توجد محاضرات متاحة حالياً.</div>';
        db.lectures = [];
        snapshot.forEach((doc) => {
            const item = { id: doc.id, ...doc.data() };
            db.lectures.push(item);
            createLectureCard(item, false);
        });
        
        if (db.lectures.length > 0) {
            const latest = db.lectures[db.lectures.length - 1];
            updateLatestLecture(latest.title, latest.videoSrc, latest.thumbnailUrl);
        }
        checkEmpty('lectures-container', 'lectures-empty');
    });
    // Tasks Listener
    const qTasks = query(collection(dbFirestore, "tasks"), orderBy("timestamp", "asc"));
    onSnapshot(qTasks, (snapshot) => {
        const container = document.getElementById('tasks-container');
        container.innerHTML = ''; // Clear it
        db.tasks = [];
        snapshot.forEach((doc) => {
            const item = { id: doc.id, ...doc.data() };
            db.tasks.push(item);
            createTaskElement(item); // New function
        });
        checkEmpty('tasks-container', 'no-tasks');
        if (snapshot.empty) {
            container.innerHTML = `<div class="empty-state-msg" id="no-tasks"><i class="far fa-calendar-check fa-3x"></i><p class="bold">لم يتم تحديد جدول اليوم بعد</p><p class="text-muted">سيقوم الدكتور بتحديد المهام قريباً.</p></div>`;
        }
    });
}

window.onload = () => {
    // Make functions globally available for HTML onclick events
    bindGlobalFunctions(); // Bind functions FIRST
    
    if(localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        const icon = document.getElementById('theme-icon');
        if(icon) icon.classList.replace('fa-moon', 'fa-sun');
    }

    // Check auth state, which will trigger admin mode if logged in
    // and then initialize data listeners.
    // The onAuthStateChanged listener will handle the rest.
    initRealtimeListeners(); // THEN load data
};

// --- Auth State Change Listener ---
onAuthStateChanged(auth, (user) => {
    const loginOverlay = document.getElementById('student-login-overlay');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
        // A user is logged in via Firebase (Admin or Social)
        loginOverlay.classList.remove('active');
        logoutBtn.classList.remove('hidden'); // Show logout button
        
        // This is a basic check. For production, use custom claims.
        // IMPORTANT: Replace with your actual admin email
        if (user.email === "admin@example.com") { 
            enableAdminMode();
        } else {
            // Assumed to be a student from social login
            sessionStorage.setItem('studentLoggedIn', 'true');
            sessionStorage.setItem('studentName', user.displayName);
            document.querySelector('.profile-name-modal').textContent = user.displayName;
            disableAdminMode();
        }
    } else {
        // No user is logged in via Firebase.
        loginOverlay.classList.add('active');
        logoutBtn.classList.add('hidden');
        disableAdminMode();
    }
});


// --- Profile & Notifications ---
function showProfile() {
    // If not logged in, show login overlay. Otherwise, show profile modal.
    if (!auth.currentUser) {
        document.getElementById('student-login-overlay').classList.add('active');
    } else {
        document.getElementById('profileModal').classList.add('active');
    }
}

function closeProfile(event) {
    if (!event || event.target === document.getElementById('profileModal')) {
        document.getElementById('profileModal').classList.remove('active');
    }
}

function toggleNotifications() {
    document.getElementById('notif-menu').classList.toggle('hidden');
}

// --- Login Functions ---

async function signInWithProvider(providerName) {
    const provider = providerName === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        alert(`أهلاً بك يا ${user.displayName}!`);
        // The onAuthStateChanged listener will handle the rest.
    } catch (error) {
        console.error(`Error with ${providerName} sign-in:`, error);
        alert(`حدث خطأ أثناء تسجيل الدخول باستخدام ${providerName}.`);
    }
}

function signInWithGoogle() {
    signInWithProvider('google');
}

function signInWithFacebook() {
    // Note: Facebook login requires more setup in Firebase and Facebook for Developers console.
    signInWithProvider('facebook');
}

function logout() {
    signOut(auth).catch(error => console.error("Sign out error", error));
    // The onAuthStateChanged listener will handle UI changes.
}

// --- Admin Logic ---
function showAdminLoginView() {
    document.getElementById('main-login-form').classList.add('hidden');
    document.getElementById('admin-login-view').classList.remove('hidden');
}

async function attemptAdminLogin() {
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;

    if (!email || !password) {
        alert("الرجاء إدخال البريد الإلكتروني وكلمة المرور.");
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // Signed in 
        alert("تم تسجيل الدخول بنجاح. مرحباً دكتور عبدالله!");
        closeProfile(null);
    } catch (error) {
        console.error("Admin login error:", error);
        alert("فشل تسجيل الدخول. تأكد من صحة البيانات.");
    }
}

function showMainLoginView() {
    document.getElementById('admin-login-form').classList.add('hidden');
    document.getElementById('main-login-form').classList.remove('hidden');
}

function enableAdminMode() {
    document.body.classList.add('is-admin');
    db.isAdmin = true;
}

async function deleteItem(btn, containerId, emptyMsgId) {
    if(confirm('هل أنت متأكد من الحذف؟')) {
        const itemElement = btn.closest('.directive-item, .card, .task-item, .photo-card');
        const id = itemElement.dataset.id;

        if (!id) { // For local only items (shouldn't happen with Firestore)
            itemElement.remove();
            checkEmpty(containerId, emptyMsgId);
            return;
        }

        // Determine collection based on container
        let collectionName = '';
        if (containerId === 'directives-container') collectionName = 'directives';
        else if (containerId === 'photos-container') collectionName = 'photos';
        else if (containerId === 'lectures-container') collectionName = 'lectures';
        else if (containerId === 'tasks-container') collectionName = 'tasks';

        if (collectionName) {
            try {
                await deleteDoc(doc(dbFirestore, collectionName, id));
                // UI update will happen automatically via onSnapshot
            } catch (error) {
                console.error("Error deleting document: ", error);
                alert("حدث خطأ أثناء الحذف.");
            }
        }
    }
}

function checkEmpty(containerId, emptyMsgId) {
    const container = document.getElementById(containerId);
    const msg = document.getElementById(emptyMsgId);
    if(container.children.length <= 1) msg.style.display = 'block';
}

function showAlert(msg) { alert(msg); }

// --- Directives & Tasks Logic ---
function adminAddDirective(type) {
    const container = document.getElementById('directives-container');
    const emptyMsg = document.getElementById('no-directives');

    if (type === 'text') {
        // Instead of prompt, show an inline editor
        showDirectiveInput();
    } else {
        // Create a file input to upload from device
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Upload to Firebase Storage
            uploadFileToStorage(file, 'directives').then(url => {
                const directiveData = { type: 'image', content: url, timestamp: serverTimestamp() };
                
                // Add to Firestore
                addDoc(collection(dbFirestore, "directives"), directiveData).then((docRef) => {
                    // Automations: Add to Gallery & Send Notification
                    const photoData = { src: url, timestamp: serverTimestamp() };
                    addDoc(collection(dbFirestore, "photos"), photoData);

                    addSystemNotification(
                        'صورة جديدة', 
                        'قام الدكتور بإضافة صورة جديدة في التوجيهات.', 
                        url, 
                        { view: 'home', id: docRef.id }
                    );
                });
            }).catch(err => {
                console.error(err);
                alert("فشل رفع الصورة");
            });

            document.body.removeChild(fileInput); // Clean up
        };
        document.body.appendChild(fileInput);
        fileInput.click();
    }
}

function toggleDirectiveButtons(disabled) {
    const buttons = document.querySelectorAll('.card.stat-card-premium .header-actions-group button');
    buttons.forEach(btn => btn.disabled = disabled);
}

function showDirectiveInput() {
    // Prevent adding multiple input boxes
    if (document.querySelector('.directive-input-item')) return;

    toggleDirectiveButtons(true); // Disable add buttons

    const container = document.getElementById('directives-container');
    const emptyMsg = document.getElementById('no-directives');
    emptyMsg.style.display = 'none';

    const div = document.createElement('div');
    div.className = 'directive-item directive-input-item'; // Use both classes for similar styling

    div.innerHTML = `
        <textarea class="directive-textarea" placeholder="اكتب توجيهك هنا..."></textarea>
        <div class="directive-input-actions">
            <button class="btn-secondary" onclick="cancelNewDirective(this)">إلغاء</button>
            <button class="btn-primary" onclick="saveNewDirective(this)">حفظ</button>
        </div>
    `;

    container.prepend(div);
    div.querySelector('textarea').focus();
}

async function saveNewDirective(buttonEl) {
    const inputItem = buttonEl.closest('.directive-input-item');
    const textarea = inputItem.querySelector('.directive-textarea');
    const content = textarea.value.trim();

    if (content) {
        buttonEl.textContent = 'جاري النشر...';
        const directiveData = {
            type: 'text',
            content: content,
            timestamp: serverTimestamp()
        };
        
        try {
            await addDoc(collection(dbFirestore, "directives"), directiveData);
            // Notification logic can be handled here or triggered by snapshot if needed, 
            // but for instant feedback on actions we can send it.
            // Note: ID is not available until after addDoc, but snapshot handles rendering.
            addSystemNotification('توجيه جديد', content.substring(0, 50) + '...', null);
        } catch (e) {
            alert("فشل الحفظ");
        }
    }
    
    inputItem.remove();
    toggleDirectiveButtons(false); // Re-enable add buttons
    checkEmpty('directives-container', 'no-directives');
}

function cancelNewDirective(buttonEl) {
    const inputItem = buttonEl.closest('.directive-input-item');
    inputItem.remove();
    toggleDirectiveButtons(false); // Re-enable add buttons
    checkEmpty('directives-container', 'no-directives');
}

function startEditDirective(buttonEl) {
    const itemElement = buttonEl.closest('.directive-item');
    const bodyContent = itemElement.querySelector('.directive-body-content');
    if (!bodyContent || itemElement.querySelector('.directive-edit-container')) return;

    const id = itemElement.dataset.id;
    const directive = db.directives.find(d => d.id == id);
    if (!directive) return;

    bodyContent.style.display = 'none';
    itemElement.querySelector('.item-meta').style.display = 'none';

    const editContainer = document.createElement('div');
    editContainer.className = 'directive-edit-container';
    editContainer.innerHTML = `
        <textarea class="directive-textarea">${directive.content}</textarea>
        <div class="directive-input-actions">
            <button class="btn-secondary" onclick="cancelEditDirective(this)">إلغاء</button>
            <button class="btn-primary" onclick="saveEditDirective(this)">حفظ التعديل</button>
        </div>
    `;
    itemElement.appendChild(editContainer);
    editContainer.querySelector('textarea').focus();
}

async function saveEditDirective(buttonEl) {
    const itemElement = buttonEl.closest('.directive-item');
    const id = itemElement.dataset.id;
    const editContainer = itemElement.querySelector('.directive-edit-container');
    const textarea = editContainer.querySelector('textarea');
    const newContent = textarea.value.trim();

    if (newContent) {
        try {
            await updateDoc(doc(dbFirestore, "directives", id), {
                content: newContent
            });
            // Snapshot will update UI
        } catch (e) {
            console.error(e);
            alert("فشل التعديل");
        }
    }
    
    // Cleanup
    itemElement.querySelector('.directive-body-content').style.display = 'block';
    itemElement.querySelector('.item-meta').style.display = 'flex';
    editContainer.remove();
}

function cancelEditDirective(buttonEl) {
    const itemElement = buttonEl.closest('.directive-item');
    itemElement.querySelector('.directive-body-content').style.display = 'block';
    itemElement.querySelector('.item-meta').style.display = 'flex';
    itemElement.querySelector('.directive-edit-container').remove();
}

function createDirectiveElement(directive) {
    const container = document.getElementById('directives-container');
    const emptyMsg = document.getElementById('no-directives');
    if (emptyMsg) emptyMsg.style.display = 'none';

    const div = document.createElement('div');
    div.className = 'directive-item';
    div.dataset.id = directive.id;
    
    let body = '';
    if (directive.type === 'text') {
        body = `<p>${directive.content}</p>`;
    } else { // type === 'image'
        body = `<img src="${directive.content}" alt="صورة مرفقة" class="directive-image" onclick="openImageModal('${directive.content}')">`;
    }
    
    const timeString = directive.timestamp ? new Date(directive.timestamp.toDate()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'الآن';

    let editBtn = '';
    if (directive.type === 'text') {
        editBtn = `<button class="admin-visible card-edit-btn" onclick="startEditDirective(this)">
                       <i class="fas fa-pencil-alt"></i>
                   </button>`;
    }

    div.innerHTML = `
        <button class="admin-visible card-delete-btn" onclick="deleteItem(this, 'directives-container', 'no-directives')">
            <i class="fas fa-trash"></i>
        </button>
        ${editBtn}
        <div class="directive-body-content">${body}</div>
        <div class="item-meta">
            <i class="far fa-clock"></i>
            <span>أضيف ${timeString}</span>
        </div>
    `;
    container.prepend(div);
}

// --- Auto Notification Logic ---
function addSystemNotification(title, message, thumbnailUrl = null, link = null) {
    // Simple Beep Sound (Base64 encoded to avoid external files)
    const beep = new Audio("data:audio/wav;base64,UklGRl9vT1BXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU");
    beep.play().catch(e => console.log("Audio play blocked until interaction"));

    const list = document.getElementById('notif-list-container');
    const emptyMsg = document.querySelector('.empty-notif-msg');
    
    if(emptyMsg) emptyMsg.style.display = 'none';
    
    let thumbnailHtml = '';
    if (thumbnailUrl) {
        thumbnailHtml = `<img src="${thumbnailUrl}" class="notif-thumbnail">`;
    }

    const timeString = new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: 'numeric' });

    const item = document.createElement('div');
    item.className = 'notif-item';
    if (link) {
        item.style.cursor = 'pointer';
        item.onclick = () => handleNotificationClick(link.view, link.id);
    }

    item.innerHTML = `
        ${thumbnailHtml}
        <div class="notif-content">
            <p class="notif-title">${title}</p>
            <p class="notif-message">${message}</p>
            <span class="notif-time">${timeString}</span>
        </div>
    `;
    
    list.prepend(item);
    
    // Show badge indicator
    const badge = document.querySelector('.notif-badge');
    if(badge) badge.style.display = 'block';
}

function handleNotificationClick(view, id) {
    const navLink = document.querySelector(`.nav-item[onclick*="'${view}'"]`);
    if (navLink) {
        navLink.click();
    }

    document.getElementById('notif-menu').classList.add('hidden');

    setTimeout(() => {
        const element = document.querySelector(`[data-id='${id}']`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.style.transition = 'box-shadow 0.3s ease-in-out, transform 0.3s ease-in-out';
            element.style.boxShadow = `0 0 0 3px var(--primary)`;
            element.style.transform = 'scale(1.02)';
            setTimeout(() => { element.style.boxShadow = ''; element.style.transform = ''; }, 2500);
        }
    }, 300);
}

function markAllRead() {
    const list = document.getElementById('notif-list-container');
    // Remove all notification items
    const items = list.querySelectorAll('.notif-item');
    items.forEach(item => item.remove());
    
    // Show empty message
    const emptyMsg = document.querySelector('.empty-notif-msg');
    if(emptyMsg) emptyMsg.style.display = 'block';
    
    // Hide badge
    const badge = document.querySelector('.notif-badge');
    if(badge) badge.style.display = 'none';
}

// --- Auto Add Image to Gallery ---
function addImageToGallery(photo, addToDb = false) { // addToDb is legacy param, unused with Firestore logic
    const container = document.getElementById('photos-container');
    const emptyMsg = document.getElementById('photos-empty');
    
    if(emptyMsg) emptyMsg.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.id = photo.id;
    const timeString = photo.timestamp ? new Date(photo.timestamp.toDate()).toLocaleDateString('ar-EG') : 'اليوم';

    card.innerHTML = `
        <button class="admin-visible card-delete-btn" onclick="deleteItem(this, 'photos-container', 'photos-empty')">
            <i class="fas fa-trash"></i>
        </button>
        <img src="${photo.src}" onclick="openImageModal('${photo.src}')">
        <div class="card-meta-overlay">
            <span>${timeString}</span>
        </div>
    `;
    // Prepend the new card to show newest first
    container.prepend(card);
}

async function adminAddTask() {
    const input = document.getElementById('newTaskInput');
    const text = input.value.trim();
    if (!text) return;

    const taskData = {
        text: text,
        completed: false,
        timestamp: serverTimestamp()
    };

    try {
        await addDoc(collection(dbFirestore, "tasks"), taskData);
        input.value = ''; // Clear input on success
    } catch (e) {
        console.error("Error adding task: ", e);
        alert("فشل إضافة المهمة.");
    }
}

function createTaskElement(task) {
    const container = document.getElementById('tasks-container');
    const div = document.createElement('div');
    div.className = 'task-item';
    if (task.completed) {
        div.classList.add('completed');
    }
    div.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.onchange = () => {
        updateDoc(doc(dbFirestore, "tasks", task.id), {
            completed: checkbox.checked
        });
    };

    const label = document.createElement('span');
    label.className = 'task-label';
    label.textContent = task.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'admin-visible admin-action-btn btn-delete';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.onclick = () => deleteItem(deleteBtn, 'tasks-container', 'no-tasks');

    div.appendChild(checkbox);
    div.appendChild(label);
    div.appendChild(deleteBtn);
    container.appendChild(div);
}

function generateVideoThumbnail(videoFile) {
    return new Promise((resolve, reject) => {
        // Thumbnails generation from file object is complex. 
        // For Firestore, we will skip client-side thumbnail generation to keep it simple,
        // or use a placeholder, as full implementation requires uploading video first.
        // We will just resolve with a placeholder or handle it after upload.
        resolve('https://via.placeholder.com/300x200?text=Video');
    });
}

function adminAddLecture() {
    showLectureInput();
}

function showLectureInput() {
    if (document.querySelector('.lecture-input-card')) return;

    const container = document.getElementById('lectures-container');
    // إخفاء رسالة لا توجد محاضرات مؤقتاً عند بدء الإضافة
    const emptyMsg = document.getElementById('lectures-empty');
    if(emptyMsg) emptyMsg.style.display = 'none';
    
    const card = document.createElement('div');
    card.className = 'card lecture-input-card';

    card.innerHTML = `
        <h4 style="margin-bottom: 15px;">إضافة محاضرة جديدة</h4>
        <input type="text" class="lecture-title-input" placeholder="عنوان المحاضرة...">
        <div class="file-drop-zone">
            <i class="fas fa-video"></i>
            <span class="file-name-display">اسحب ملف الفيديو إلى هنا أو اضغط للاختيار</span>
        </div>
        <div class="upload-progress-container hidden">
            <div class="progress-bar"></div>
            <span class="progress-text">0%</span>
        </div>
        <div class="lecture-input-actions">
            <button class="btn-secondary" onclick="cancelNewLecture(this)">إلغاء</button>
            <button class="btn-primary" onclick="saveNewLecture(this)" disabled>حفظ</button>
        </div>
    `;

    // إضافة بطاقة الإدخال في بداية القائمة
    container.prepend(card);

    const fileDropZone = card.querySelector('.file-drop-zone');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/*';
    fileInput.style.display = 'none';

    fileDropZone.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            card.file = file;
            card.querySelector('.file-name-display').textContent = file.name;
            card.querySelector('.btn-primary').disabled = false;
        }
    };
    
    card.appendChild(fileInput);
    card.querySelector('.lecture-title-input').focus();
}

function cancelNewLecture(buttonEl) {
    buttonEl.closest('.lecture-input-card').remove();
}

async function saveNewLecture(buttonEl) {
    const card = buttonEl.closest('.lecture-input-card');
    const titleInput = card.querySelector('.lecture-title-input');
    const title = titleInput.value.trim();
    const videoFile = card.file;

    if (!title || !videoFile) {
        alert('الرجاء إدخال عنوان واختيار ملف فيديو.');
        return;
    }

    buttonEl.disabled = true;
    card.querySelector('.btn-secondary').disabled = true; // Disable cancel button during upload
    
    const progressContainer = card.querySelector('.upload-progress-container');
    const progressBar = card.querySelector('.progress-bar');
    const progressText = card.querySelector('.progress-text');
    progressContainer.classList.remove('hidden');

    const storageRef = ref(storage, 'lectures/videos/' + Date.now() + '_' + videoFile.name);
    const uploadTask = uploadBytesResumable(storageRef, videoFile);

    uploadTask.on('state_changed', 
        (snapshot) => {
            // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            progressBar.style.width = progress + '%';
            progressText.textContent = Math.round(progress) + '%';
        }, 
        (error) => {
            // Handle unsuccessful uploads
            console.error("Upload failed:", error);
            alert("فشل رفع الفيديو. الرجاء المحاولة مرة أخرى.");
            buttonEl.disabled = false;
            card.querySelector('.btn-secondary').disabled = false;
            progressContainer.classList.add('hidden');
        }, 
        async () => {
            // Handle successful uploads on complete
            progressText.textContent = 'جاري المعالجة...';
            try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                const thumbnailUrl = 'https://via.placeholder.com/300x169.png?text=Lecture'; 

                const lectureData = {
                    title: title,
                    videoSrc: downloadURL,
                    thumbnailUrl: thumbnailUrl,
                    timestamp: serverTimestamp()
                };
                
                const docRef = await addDoc(collection(dbFirestore, "lectures"), lectureData);
                addSystemNotification('محاضرة جديدة', `تمت إضافة محاضرة: ${title}`, thumbnailUrl, { view: 'lectures', id: docRef.id });
                card.remove();
            } catch (error) {
                console.error(error);
                alert('حدث خطأ أثناء حفظ الفيديو.');
                buttonEl.disabled = false;
                card.querySelector('.btn-secondary').disabled = false;
            }
        }
    );
}

function createLectureCard(lecture, addToDb = false) {
    const container = document.getElementById('lectures-container');
    const emptyMsg = document.getElementById('lectures-empty');
    if(emptyMsg) emptyMsg.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'card lecture-card';
    card.dataset.id = lecture.id;
    card.onclick = function() { openVideoModal(lecture.videoSrc, lecture.title); };

    const timeString = lecture.timestamp ? new Date(lecture.timestamp.toDate()).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' }) : 'الآن';

    card.innerHTML = `
        <button class="admin-visible card-delete-btn" onclick="event.stopPropagation(); deleteItem(this, 'lectures-container', 'lectures-empty')">
            <i class="fas fa-trash"></i>
        </button>
        <div class="lecture-thumbnail-wrapper">
            <img src="${lecture.thumbnailUrl}" alt="صورة مصغرة للمحاضرة">
            <div class="play-badge"><i class="fas fa-play"></i></div>
        </div>
        <div style="padding-top:10px;">
            <h4 style="margin-bottom: 5px; font-size: 1rem;">${lecture.title}</h4>
            <div class="lecture-meta">
                <p class="text-muted-small"><i class="fas fa-video"></i> محاضرة فيديو</p>
                <p class="text-muted-small"><i class="far fa-clock"></i> ${timeString}</p>
            </div>
        </div>
    `;
    
    // إضافة المحاضرة الجديدة في البداية لتظهر كأحدث محاضرة
    container.prepend(card);
}

function updateLatestLecture(title, videoSrc, thumbnailUrl) {
    const card = document.getElementById('latest-lecture-card');
    const thumb = document.getElementById('latest-lecture-thumb');
    const titleEl = document.getElementById('latest-lecture-title');
    const descEl = document.getElementById('latest-lecture-desc');
    const playBadge = document.getElementById('latest-lecture-play-badge');

    titleEl.textContent = title;
    descEl.innerHTML = `<i class="far fa-play-circle"></i> اضغط للمشاهدة`;
    
    thumb.src = thumbnailUrl;
    thumb.style.display = 'block';
    playBadge.style.display = 'flex';

    card.onclick = () => openVideoModal(videoSrc, title);
}

function adminAddGalleryPhoto() {
    // Allow admin to add photo directly to gallery
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        uploadFileToStorage(file, 'photos').then(url => {
            const photoData = { src: url, timestamp: serverTimestamp() };
            addDoc(collection(dbFirestore, "photos"), photoData);
            
            // Sync with Directives
            const directiveData = { type: 'image', content: url, timestamp: serverTimestamp() };
            addDoc(collection(dbFirestore, "directives"), directiveData);

            addSystemNotification('صورة جديدة', 'تمت إضافة صورة جديدة لألبوم الحصص.', url);
        });

        document.body.removeChild(fileInput); // Clean up
    };
    document.body.appendChild(fileInput);
    fileInput.click();
}

function adminAddNote() {
    // Placeholder for adding notes
    alert('سيتم إضافة خاصية رفع المذكرات قريباً!');
}

// --- Video Modal Logic ---
function openVideoModal(videoUrl, title) {
    const modal = document.getElementById('videoModal');
    const modalVideo = document.getElementById('modalVideo');
    const modalTitle = document.getElementById('modalVideoTitle');

    modalTitle.textContent = title;
    modalVideo.src = videoUrl;
    modal.classList.add('active');
    modalVideo.play();
}

function closeVideoModal(event) {
    // Close if the click is on the overlay itself (or the close button is clicked)
    if (!event || event.target.id === 'videoModal') {
        const modal = document.getElementById('videoModal');
        const modalVideo = document.getElementById('modalVideo');
        modalVideo.pause();
        modalVideo.src = ""; // Detach source to stop background loading
        modal.classList.remove('active');
    }
}

// --- Image Modal Logic ---
function openImageModal(imageUrl) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const downloadBtn = document.getElementById('downloadImageBtn');

    modalImage.src = imageUrl;
    downloadBtn.href = imageUrl;
    // Extract filename for download attribute
    const filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
    downloadBtn.setAttribute('download', filename);

    modal.classList.add('active');
}

function closeImageModal(event) {
    // Close if the click is on the overlay itself (or the close button is clicked)
    if (!event || event.target.id === 'imageModal') {
        document.getElementById('imageModal').classList.remove('active');
    }
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    const notifMenu = document.getElementById('notif-menu');
    const notifBtn = document.querySelector('.notif-btn');
    if (notifMenu && !notifMenu.classList.contains('hidden') && !notifBtn.contains(e.target)) {
        notifMenu.classList.add('hidden');
    }
});

// --- Binding Functions to Window for HTML Access ---
function bindGlobalFunctions() {
    window.toggleSidebar = toggleSidebar;
    window.switchTab = switchTab;
    window.toggleTheme = toggleTheme;
    window.showProfile = showProfile;
    window.closeProfile = closeProfile;
    window.toggleNotifications = toggleNotifications;
    window.adminAddDirective = adminAddDirective;
    window.adminAddTask = adminAddTask;
    window.adminAddLecture = adminAddLecture;
    window.adminAddGalleryPhoto = adminAddGalleryPhoto;
    window.adminAddNote = adminAddNote;
    window.deleteItem = deleteItem;
    window.closeImageModal = closeImageModal;
    window.closeVideoModal = closeVideoModal;
    window.markAllRead = markAllRead;
    window.cancelNewDirective = cancelNewDirective;
    window.saveNewDirective = saveNewDirective;
    window.startEditDirective = startEditDirective;
    window.cancelEditDirective = cancelEditDirective;
    window.saveEditDirective = saveEditDirective;
    window.cancelNewLecture = cancelNewLecture;
    window.saveNewLecture = saveNewLecture;
    window.showAlert = showAlert;
    window.handleNotificationClick = handleNotificationClick;
    window.showAdminLoginView = showAdminLoginView;
    window.showMainLoginView = showMainLoginView;
    window.attemptAdminLogin = attemptAdminLogin;
    window.logout = logout;
    window.signInWithGoogle = signInWithGoogle;
    window.signInWithFacebook = signInWithFacebook;
}

function disableAdminMode() {
    document.body.classList.remove('is-admin');
    db.isAdmin = false;
}