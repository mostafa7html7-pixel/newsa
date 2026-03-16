// --- Firebase Imports & Config ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp, getDoc, setDoc, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

// --- External Upload Settings ---
const IMGBB_API_KEY = "0385965848fc62374c1c82810ffa7d18";
const CLOUDINARY_CLOUD_NAME = "dzwrz9qzb";
const CLOUDINARY_PRESET = "ml_defaulte";

// The smart upload function with progress for videos
function smartUpload(file, onProgress) {
    return new Promise(async (resolve, reject) => {
        const formData = new FormData();
        const isVideo = file.type.startsWith('video/');

        if (isVideo) {
            // Upload to Cloudinary with XMLHttpRequest for progress
            formData.append("file", file);
            formData.append("upload_preset", CLOUDINARY_PRESET);

            const xhr = new XMLHttpRequest();
            xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, true);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable && onProgress) {
                    const progress = (event.loaded / event.total) * 100;
                    onProgress(progress);
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const data = JSON.parse(xhr.responseText);
                    resolve(data.secure_url);
                } else {
                    const data = JSON.parse(xhr.responseText);
                    reject(new Error(data.error.message || 'Cloudinary upload failed'));
                }
            };

            xhr.onerror = () => {
                reject(new Error('Network error during upload.'));
            };

            xhr.send(formData);

        } else {
            // Upload to ImgBB (for images) - no progress available with this simple fetch
            try {
                formData.append("image", file);
                const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                    method: "POST",
                    body: formData
                });
                const data = await response.json();
                if (!data.success) { throw new Error(data.error.message || 'ImgBB upload failed'); }
                resolve(data.data.url);
            } catch (error) {
                reject(error);
            }
        }
    });
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
    exams: [], // Added exams cache
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

    // Exams Listener
    const qExams = query(collection(dbFirestore, "exams"), orderBy("createdAt", "desc"));
    onSnapshot(qExams, (snapshot) => {
        const container = document.getElementById('exams-container');
        container.innerHTML = '<div class="empty-state-msg" id="exams-empty" style="display:none">لا توجد اختبارات متاحة حالياً.</div>';
        db.exams = [];
        snapshot.forEach((doc) => {
            const item = { id: doc.id, ...doc.data() };
            db.exams.push(item);
            createExamCard(item);
        });
        checkEmpty('exams-container', 'exams-empty');
    });

    // Students Listener (for Admin)
    const qStudents = query(collection(dbFirestore, "students"), orderBy("name", "asc"));
    onSnapshot(qStudents, (snapshot) => {
        const container = document.getElementById('students-container');
        container.innerHTML = ''; // Clear it
        if (snapshot.empty) {
            container.innerHTML = `<div class="empty-state-msg" style="grid-column: 1/-1;">لا يوجد طلاب مسجلون بعد.</div>`;
        } else {
            snapshot.forEach((doc) => {
                createStudentCard({ id: doc.id, ...doc.data() });
            });
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

onAuthStateChanged(auth, async (user) => {
    const loginOverlay = document.getElementById('student-login-overlay');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
        // A user is logged in via Firebase Auth
        
        // CHECK 1: Is the user an admin?
        const adminRef = doc(dbFirestore, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists() && adminSnap.data().role === "super_admin") {
            console.log("Admin access granted for:", user.email);
            enableAdminMode();
            loginOverlay.classList.remove('active');
            logoutBtn.classList.remove('hidden');
            return; // Done, no need to check for student profile
        }

        // CHECK 2: If not admin, they must be a student. Check their profile.
        const studentRef = doc(dbFirestore, "students", user.uid);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
            // Student profile is complete, log them in.
            const studentData = studentSnap.data();
            sessionStorage.setItem('studentName', studentData.name);
            document.querySelector('.profile-name-modal').textContent = studentData.name;
            loginOverlay.classList.remove('active');
            logoutBtn.classList.remove('hidden');
            disableAdminMode();
        } else {
            // New student, needs to complete their profile.
            disableAdminMode();
            document.getElementById('complete-profile-modal').classList.add('active');
            const previewImg = document.getElementById('profilePicPreview');
            const placeholderDiv = document.getElementById('profilePicPlaceholder');
            if (user.photoURL) {
                previewImg.src = user.photoURL;
                previewImg.style.display = 'block';
                placeholderDiv.style.display = 'none';
            } else {
                previewImg.style.display = 'none';
                placeholderDiv.style.display = 'flex';
            }
            document.getElementById('fullName').value = user.displayName || '';
            loginOverlay.classList.remove('active');
        }

    } else {
        // No one is logged in at all. Show login screen.
        loginOverlay.classList.add('active');
        logoutBtn.classList.add('hidden');
        disableAdminMode();
    }
});


// --- Profile & Notifications ---
function showProfile() {
    document.getElementById('profileModal').classList.add('active');
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

async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        // The onAuthStateChanged listener will handle the rest.
    } catch (error) {
        console.error("Error with Google sign-in:", error);
        alert("حدث خطأ أثناء تسجيل الدخول باستخدام Google.");
    }
}

function logout() {
    // If a firebase user is logged in (student), sign them out
    signOut(auth).catch(error => console.error("Sign out error", error));
    sessionStorage.removeItem('studentLoggedIn');
    sessionStorage.removeItem('studentName');
    
    // Reload to show login screen
    window.location.reload(); 
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
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest
        alert("تم تسجيل الدخول بنجاح. مرحباً دكتور عبدالله!");
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

async function saveStudentProfile() {
    const user = auth.currentUser;
    if (!user) return alert("لا يوجد مستخدم مسجل للدخول!");

    const fullName = document.getElementById('fullName').value.trim();
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const division = document.getElementById('studentDivision').value;
    const profilePicFile = document.getElementById('profilePicInput').files[0];
    const saveButton = document.querySelector('#complete-profile-modal button');

    if (!fullName || !phoneNumber || !division) {
        return alert("الرجاء ملء جميع الحقول.");
    }

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        let photoURL = user.photoURL; // Default to Google's photo
        if (profilePicFile) {
            photoURL = await smartUpload(profilePicFile);
        }

        const studentData = {
            name: fullName,
            phone: phoneNumber,
            division: division,
            email: user.email,
            photoURL: photoURL,
            uid: user.uid,
            joinedAt: serverTimestamp()
        };

        await setDoc(doc(dbFirestore, "students", user.uid), studentData);

        alert("تم حفظ ملفك الشخصي بنجاح!");
        document.getElementById('complete-profile-modal').classList.remove('active');
        // Re-run session handler to log the user in properly
        handleUserSession(user);

    } catch (error) {
        console.error("Error saving profile:", error);
        alert("حدث خطأ أثناء حفظ البيانات.");
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "حفظ ومتابعة";
    }
}

function previewProfilePic(event) {
    const file = event.target.files[0];
    if (file) {
        const previewImg = document.getElementById('profilePicPreview');
        const placeholderDiv = document.getElementById('profilePicPlaceholder');
        previewImg.src = URL.createObjectURL(file);
        previewImg.style.display = 'block';
        placeholderDiv.style.display = 'none';
    }
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
        else if (containerId === 'exams-container') collectionName = 'exams';

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

    // Safety check to prevent errors if elements don't exist
    if (!container) {
        // If the container exists but the message doesn't, it might have been cleared.
        // The onSnapshot logic should handle re-creating the empty message.
        return;
    }
    const msg = document.getElementById(emptyMsgId);
    if (!msg) return;

    const items = container.querySelectorAll('.card, .photo-card, .directive-item, .task-item');
    if (items.length === 0) {
        msg.style.display = 'block';
    } else {
        msg.style.display = 'none';
    }
}

function createExamCard(exam) {
    const container = document.getElementById('exams-container');
    const card = document.createElement('div');
    card.className = 'card searchable-item';
    card.dataset.id = exam.id;

    // Format date if available
    const dateString = exam.createdAt ? new Date(exam.createdAt.toDate()).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

    card.innerHTML = `
        <div class="flex-between-responsive" style="align-items: center;">
            <div style="flex: 1;">
                <h3 style="color:var(--accent); margin-bottom: 8px;">${exam.title}</h3>
                <div class="exam-meta-tags" style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.85rem; color: var(--text-muted);">
                    <span><i class="fas fa-list-ol"></i> ${exam.questions.length} أسئلة</span>
                    <span><i class="far fa-clock"></i> ${exam.duration} دقيقة</span>
                    <span><i class="fas fa-redo"></i> ${exam.attempts} محاولات</span>
                    ${dateString ? `<span><i class="far fa-calendar-alt"></i> ${dateString}</span>` : ''}
                </div>
            </div>
            <div style="margin-right: 15px;">
                <button class="btn-primary" onclick="startExam('${exam.id}')">بدء الاختبار</button>
            </div>
        </div>
        <div class="admin-visible" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border);">
            <button class="btn-secondary" style="width:100%; font-size: 0.85rem;" onclick="viewExamResultsAdmin('${exam.id}', '${exam.title}')">
                <i class="fas fa-chart-bar"></i> عرض نتائج الطلاب
            </button>
        </div>
        <button class="admin-visible card-delete-btn" onclick="deleteItem(this, 'exams-container', 'exams-empty')"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(card);
}

function createStudentCard(student) {
    const container = document.getElementById('students-container');
    const card = document.createElement('div');
    card.className = 'card student-card';
    card.dataset.id = student.uid;
    
    const divisionLabel = student.division === 'science' ? 'علمي علوم' : 'علمي رياضة';

    card.innerHTML = `
        <div class="profile-img-large" style="cursor: pointer;" onclick="openImageModal('${student.photoURL || 'https://via.placeholder.com/80'}')">
            <img src="${student.photoURL || 'https://via.placeholder.com/80'}" alt="${student.name}">
        </div>
        <h4 class="student-card-name">${student.name}</h4>
        <p class="student-card-email">${student.email}</p>
        <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-muted);">
            <p><i class="fas fa-phone-alt"></i> ${student.phone}</p>
            <p><i class="fas fa-layer-group"></i> ${divisionLabel}</p>
        </div>
    `;

    container.appendChild(card);
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
            smartUpload(file).then(url => {
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

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

function generateVideoThumbnail(videoFile) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        video.preload = 'metadata';
        video.src = URL.createObjectURL(videoFile);
        
        video.onloadedmetadata = () => {
            video.currentTime = Math.min(1, video.duration / 2); // Seek to 1 second or midpoint
        };
        
        video.onseeked = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
            URL.revokeObjectURL(video.src);
            resolve(thumbnailUrl);
        };
        
        video.onerror = (err) => {
            console.error("Error loading video for thumbnail generation:", err);
            reject("Could not generate thumbnail.");
        };
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

    const onProgress = (progress) => {
        progressBar.style.width = progress + '%';
        progressText.textContent = `جاري الرفع... ${Math.round(progress)}%`;
    };

    try {
        // Upload video with progress tracking
        const videoUrl = await smartUpload(videoFile, onProgress);

        progressText.textContent = 'جاري معالجة الصورة المصغرة...';
        
        // Generate thumbnail from video file
        const thumbnailDataUrl = await generateVideoThumbnail(videoFile);
        const thumbnailBlob = dataURLtoBlob(thumbnailDataUrl);
        
        // Upload thumbnail (no progress needed for small image)
        const thumbnailUrl = await smartUpload(thumbnailBlob, null);

        const lectureData = {
            title: title,
            videoSrc: videoUrl,
            thumbnailUrl: thumbnailUrl,
            timestamp: serverTimestamp()
        };
        
        const docRef = await addDoc(collection(dbFirestore, "lectures"), lectureData);
        addSystemNotification('محاضرة جديدة', `تمت إضافة محاضرة: ${title}`, thumbnailUrl, { view: 'lectures', id: docRef.id });
        card.remove();

    } catch (error) {
        console.error(error);
        alert('فشل الرفع، تأكد من اتصال الإنترنت أو إعدادات الخدمة.');
        buttonEl.innerHTML = 'حفظ';
        buttonEl.disabled = false;
        card.querySelector('.btn-secondary').disabled = false;
        progressContainer.classList.add('hidden');
    }
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
        
        smartUpload(file).then(url => {
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
    window.signInWithGoogle = signInWithGoogle;
    window.logout = logout;
    window.deleteItem = deleteItem;
    window.saveStudentProfile = saveStudentProfile;
    window.previewProfilePic = previewProfilePic;
    window.openImageModal = openImageModal;
    window.saveExam = saveExam;
    window.previewQuestionImage = previewQuestionImage;
    window.removeQuestionImage = removeQuestionImage;
    window.addCurrentQuestionToExam = addCurrentQuestionToExam;
    window.deleteQuestionFromList = deleteQuestionFromList;
    window.viewExamResultsAdmin = viewExamResultsAdmin;
}


function disableAdminMode() {
    document.body.classList.remove('is-admin');
    db.isAdmin = false;
}

let currentExamQuestions = [];
// --- Exam Taking Logic ---
let currentExamData = null;
let currentQuestionIndex = 0;
let studentAnswers = [];
let examTimerInterval = null;


function addCurrentQuestionToExam() {
    const questionText = document.getElementById('composer-question-text').value.trim();
    const imageFile = document.getElementById('composer-image-input').files[0];
    const answers = Array.from(document.querySelectorAll('#composer-answers-container .answer-text')).map(input => input.value.trim());
    const correctRadio = document.querySelector('input[name="composer-correct-answer"]:checked');

    if (!questionText || answers.some(a => !a) || !correctRadio) {
        return showAlert("الرجاء ملء نص السؤال وجميع الإجابات وتحديد الإجابة الصحيحة.", "error");
    }

    const questionData = {
        text: questionText,
        imageFile: imageFile, // We'll upload this later during final save
        answers: answers,
        correctAnswer: parseInt(correctRadio.value) - 1
    };

    currentExamQuestions.push(questionData);
    renderAddedQuestionsList();
    resetQuestionComposer();
}

function renderAddedQuestionsList() {
    const listContainer = document.getElementById('added-questions-list');
    const countSpan = document.getElementById('question-count');
    listContainer.innerHTML = '';
    countSpan.textContent = currentExamQuestions.length;

    if (currentExamQuestions.length === 0) {
        listContainer.innerHTML = '<div class="empty-state-msg" style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">لم يتم إضافة أي أسئلة بعد.</div>';
        return;
    }

    currentExamQuestions.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = 'question-preview-card';
        
        let imgHTML = '';
        if (q.imageFile) {
            const imgUrl = URL.createObjectURL(q.imageFile);
            imgHTML = `<img src="${imgUrl}" class="preview-image" alt="صورة السؤال">`;
        }

        // Generate answers HTML with correct one highlighted
        const answersHTML = q.answers.map((ans, i) => {
            const isCorrect = i === q.correctAnswer;
            const icon = isCorrect ? '<i class="fas fa-check-circle"></i>' : '<i class="far fa-circle"></i>';
            return `
                <div class="preview-answer-item ${isCorrect ? 'correct' : ''}">
                    ${icon} <span>${ans}</span>
                </div>
            `;
        }).join('');

        // Render the full card
        item.innerHTML = `
            <div class="preview-header">
                <span class="preview-number">سؤال #${index + 1}</span>
                <div class="preview-actions">
                    <button class="preview-action-btn delete" onclick="deleteQuestionFromList(${index})" title="حذف">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
            <p class="preview-question-text">${q.text}</p>
            ${imgHTML}
            <div class="preview-answers-list">
                ${answersHTML}
            </div>
        `;
        listContainer.appendChild(item);
    });
}

function deleteQuestionFromList(index) {
    currentExamQuestions.splice(index, 1);
    renderAddedQuestionsList();
}

function resetQuestionComposer() {
    document.getElementById('composer-question-text').value = '';
    document.querySelectorAll('#composer-answers-container .answer-text').forEach(input => input.value = '');
    const correctRadio = document.querySelector('input[name="composer-correct-answer"]:checked');
    if (correctRadio) correctRadio.checked = false;
    
    // Reset image input
    removeQuestionImage('composer-image-input', 'composer-preview-container', 'composer-upload-btn');
}

function previewQuestionImage(event, previewId, containerId, btnId) {
    const file = event.target.files[0];
    const preview = document.getElementById(previewId);
    const container = document.getElementById(containerId);
    const uploadBtn = document.getElementById(btnId);

    if (file) {
        preview.src = URL.createObjectURL(file);
        container.classList.remove('hidden');
        uploadBtn.classList.add('hidden');
    }
}

function removeQuestionImage(inputId, containerId, btnId) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(containerId);
    const uploadBtn = document.getElementById(btnId);

    input.value = ''; // Clear the file input
    container.classList.add('hidden');
    uploadBtn.classList.remove('hidden');
}

async function saveExam() {
    const title = document.getElementById('examTitle').value.trim();
    const duration = document.getElementById('examDuration').value;
    const attempts = document.getElementById('examAttempts').value;

    if (!title || !duration || !attempts) {
        return showAlert("الرجاء ملء جميع تفاصيل الاختبار الأساسية.", "error");
    }
    
    if (currentExamQuestions.length === 0) {
        return showAlert("يجب إضافة سؤال واحد على الأقل للاختبار.", "error");
    }

    const saveBtn = document.querySelector('#view-create-exam > .exam-creator-container > .btn-primary');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ الحفظ...';

    const questionsForDb = [];

    try {
        for (const question of currentExamQuestions) {
            let imageUrl = null;
            if (question.imageFile) {
                imageUrl = await smartUpload(question.imageFile).catch(err => { 
                    console.error(err); 
                    throw new Error(`فشل رفع صورة السؤال: "${question.text.substring(0, 20)}..."`); 
                });
            }
            questionsForDb.push({
                text: question.text,
                imageUrl: imageUrl,
                answers: question.answers,
                correctAnswer: question.correctAnswer
            });
        }

        const examData = { 
            title, 
            duration: parseInt(duration), 
            attempts: parseInt(attempts), 
            questions: questionsForDb, 
            createdAt: serverTimestamp() 
        };

        await addDoc(collection(dbFirestore, "exams"), examData);
        showAlert("تم حفظ الاختبار بنجاح!", "success");
        
        // Reset UI
        switchTab({ preventDefault: () => {} }, 'exams');
        document.getElementById('examTitle').value = '';
        document.getElementById('examDuration').value = '';
        document.getElementById('examAttempts').value = '';
        currentExamQuestions = [];
        renderAddedQuestionsList(); // This will clear the list
        resetQuestionComposer();

    } catch (error) {
        console.error("Error saving exam: ", error);
        showAlert(error.message || "حدث خطأ أثناء حفظ الاختبار.", "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> حفظ ونشر الاختبار';
    }
}

async function startExam(examId) {
    const user = auth.currentUser;
    if (!user) {
        return showAlert("يجب تسجيل الدخول أولاً.", "error");
    }

    const exam = db.exams.find(e => e.id === examId);
    if (!exam) {
        return showAlert("لم يتم العثور على الاختبار.", "error");
    }

    // --- SINGLE ATTEMPT CHECK (منع التكرار) ---
    // Check if the student has already taken this exam
    const q = query(
        collection(dbFirestore, "examResults"), 
        where("examId", "==", examId),
        where("studentId", "==", user.uid)
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        // Student already took the exam
        const result = querySnapshot.docs[0].data();
        showAlert(`لقد قمت بأداء هذا الاختبار مسبقاً.\nنتيجتك: ${result.score} / ${result.totalQuestions}`, "warning");
        return; // Stop execution
    }

    currentExamData = exam;
    currentQuestionIndex = 0;
    studentAnswers = new Array(exam.questions.length).fill(null);

    // Switch view
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-take-exam').classList.remove('hidden');
    document.getElementById('question-palette-container').classList.remove('hidden');

    // Setup UI
    document.getElementById('exam-view-title').textContent = exam.title;
    renderQuestionPalette();
    renderExamQuestion();
    startTimer(exam.duration);
}

function renderExamQuestion() {
    const exam = currentExamData;
    const question = exam.questions[currentQuestionIndex];

    const progress = ((currentQuestionIndex + 1) / exam.questions.length) * 100;
    document.getElementById('exam-progress-inner').style.width = `${progress}%`;

    document.getElementById('exam-question-number').textContent = `السؤال ${currentQuestionIndex + 1} من ${exam.questions.length}`;
    document.getElementById('exam-question-text').textContent = question.text;

    const imgElement = document.getElementById('exam-question-image');
    if (question.imageUrl) {
        imgElement.src = question.imageUrl;
        imgElement.classList.remove('hidden');
    } else {
        imgElement.classList.add('hidden');
    }

    const answersContainer = document.getElementById('exam-answers-container');
    answersContainer.innerHTML = '';
    question.answers.forEach((answer, index) => {
        const isSelected = studentAnswers[currentQuestionIndex] === index;
        const answerEl = document.createElement('div');
        answerEl.className = `exam-answer-option ${isSelected ? 'selected' : ''}`;
        answerEl.onclick = () => {
            studentAnswers[currentQuestionIndex] = index;
            renderExamQuestion();
            const paletteItem = document.querySelector(`.palette-item[data-q-index="${currentQuestionIndex}"]`);
            if (paletteItem) paletteItem.classList.add('answered');
        };
        answerEl.innerHTML = `
            <div class="radio-custom"></div>
            <span>${answer}</span>
        `;
        answersContainer.appendChild(answerEl);
    });

    document.getElementById('exam-prev-btn').disabled = currentQuestionIndex === 0;
    document.getElementById('exam-next-btn').classList.toggle('hidden', currentQuestionIndex === exam.questions.length - 1);
    document.getElementById('exam-submit-btn').classList.toggle('hidden', currentQuestionIndex !== exam.questions.length - 1);
    
    updatePaletteHighlight();
}

function navigateExam(direction) {
    const newIndex = currentQuestionIndex + direction;
    if (newIndex >= 0 && newIndex < currentExamData.questions.length) {
        currentQuestionIndex = newIndex;
        renderExamQuestion();
    }
}

function jumpToQuestion(index) {
    currentQuestionIndex = index;
    renderExamQuestion();
}

function startTimer(durationMinutes) {
    clearInterval(examTimerInterval);
    let timeInSeconds = durationMinutes * 60;
    const timerEl = document.getElementById('exam-timer');

    examTimerInterval = setInterval(() => {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = timeInSeconds % 60;
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        if (timeInSeconds <= 0) {
            clearInterval(examTimerInterval);
            showAlert("انتهى الوقت! سيتم تسليم إجاباتك الآن.", "warning");
            submitExam(true);
        }
        timeInSeconds--;
    }, 1000);
}

function renderQuestionPalette() {
    const paletteGrid = document.getElementById('palette-grid');
    paletteGrid.innerHTML = '';
    currentExamData.questions.forEach((_, index) => {
        const item = document.createElement('div');
        item.className = 'palette-item';
        item.textContent = index + 1;
        item.dataset.qIndex = index;
        item.onclick = () => jumpToQuestion(index);
        paletteGrid.appendChild(item);
    });
}

function updatePaletteHighlight() {
    document.querySelectorAll('.palette-item').forEach(item => {
        item.classList.remove('current');
        if (parseInt(item.dataset.qIndex) === currentQuestionIndex) {
            item.classList.add('current');
        }
    });
}

async function submitExam(isAutoSubmit = false) {
    if (!isAutoSubmit && !confirm("هل أنت متأكد من رغبتك في تسليم الاختبار؟")) return;
    
    clearInterval(examTimerInterval);
    
    const user = auth.currentUser;
    if (!user) return showAlert("خطأ في المصادقة", "error");

    // Calculate Score
    let score = 0;
    currentExamData.questions.forEach((q, i) => { if (studentAnswers[i] === q.correctAnswer) score++; });
    const total = currentExamData.questions.length;
    const percentage = Math.round((score / total) * 100);

    // Save Result to Firestore
    try {
        await addDoc(collection(dbFirestore, "examResults"), {
            examId: currentExamData.id,
            examTitle: currentExamData.title,
            studentId: user.uid,
            studentName: sessionStorage.getItem('studentName') || user.displayName || "طالب",
            studentEmail: user.email,
            studentPhoto: user.photoURL || null,
            score: score,
            totalQuestions: total,
            percentage: percentage,
            answers: studentAnswers,
            submittedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error saving result:", error);
        // Continue to show result to student even if save fails locally
    }

    // --- Show Professional Result UI ---
    showStudentResultScreen(score, total, percentage);

    currentExamData = null;
    document.getElementById('view-take-exam').classList.add('hidden');
    document.getElementById('question-palette-container').classList.add('hidden');
}

function showStudentResultScreen(score, total, percentage) {
    const resultView = document.getElementById('view-exam-result');
    resultView.classList.remove('hidden');

    // Update Texts
    document.getElementById('result-percentage').textContent = `${percentage}%`;
    document.getElementById('result-correct-count').textContent = score;
    document.getElementById('result-wrong-count').textContent = total - score;
    document.getElementById('result-total-questions').textContent = total;

    const titleEl = document.getElementById('result-message-title');
    const subEl = document.getElementById('result-message-sub');
    const circle = document.getElementById('result-score-circle');

    // Set Progress Circle (440 is circumference)
    const offset = 440 - (440 * percentage) / 100;
    // Reset first for animation
    circle.style.strokeDashoffset = 440;
    setTimeout(() => {
        circle.style.strokeDashoffset = offset;
    }, 100);

    // Dynamic Message
    if (percentage >= 90) {
        titleEl.textContent = "أداء أسطوري!";
        titleEl.style.color = "#10b981"; // Green
        subEl.textContent = "أنت فخر للدكتور عبدالله. استمر في هذا التألق.";
        circle.style.stroke = "#10b981";
    } else if (percentage >= 75) {
        titleEl.textContent = "عمل ممتاز!";
        titleEl.style.color = "#3b82f6"; // Blue
        subEl.textContent = "نتيجتك رائعة، ركز قليلاً على الأخطاء لتصل للقمة.";
        circle.style.stroke = "#3b82f6";
    } else if (percentage >= 50) {
        titleEl.textContent = "جيد، ولكن...";
        titleEl.style.color = "#f59e0b"; // Orange
        subEl.textContent = "أنت بحاجة لبعض المراجعة. لا تيأس، المحاولة القادمة أفضل.";
        circle.style.stroke = "#f59e0b";
    } else {
        titleEl.textContent = "تحتاج لمزيد من الجهد";
        titleEl.style.color = "#ef4444"; // Red
        subEl.textContent = "راجع المحاضرات جيداً وحاول التركيز أكثر.";
        circle.style.stroke = "#ef4444";
    }
}

// --- Admin: View Results Function ---
async function viewExamResultsAdmin(examId, examTitle) {
    const container = document.getElementById('view-admin-results');
    
    // Switch View
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    container.classList.remove('hidden');

    container.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fas fa-spinner fa-spin fa-2x"></i><br>جاري تحميل النتائج...</div>`;

    try {
        // 1. إزالة orderBy من الاستعلام لتجنب مشاكل الفهرسة (Indexes)
        const q = query(collection(dbFirestore, "examResults"), where("examId", "==", examId));
        const snapshot = await getDocs(q);

        // 2. تحويل البيانات لمصفوفة وترتيبها يدوياً
        let resultsData = [];
        snapshot.forEach(doc => resultsData.push(doc.data()));
        resultsData.sort((a, b) => b.score - a.score);

        let rows = '';
        if (resultsData.length === 0) {
            rows = `<tr><td colspan="4" style="text-align:center;">لم يقم أي طالب بأداء هذا الامتحان بعد.</td></tr>`;
        } else {
            resultsData.forEach(data => {
                // التأكد من صحة التاريخ
                let date = '-';
                if (data.submittedAt && typeof data.submittedAt.toDate === 'function') {
                    date = new Date(data.submittedAt.toDate()).toLocaleDateString('ar-EG');
                }
                
                const badgeClass = data.percentage >= 50 ? 'pass' : 'fail';
                const badgeText = data.percentage >= 50 ? 'ناجح' : 'راسب';
                
                rows += `
                    <tr>
                        <td>
                            <div class="avatar-cell">
                                <img src="${data.studentPhoto || 'https://via.placeholder.com/32'}" class="avatar-small">
                                <div>
                                    <div>${data.studentName}</div>
                                    <div style="font-size:0.75rem; color:#888;">${data.studentEmail}</div>
                                </div>
                            </div>
                        </td>
                        <td><span class="score-badge ${badgeClass}">${data.percentage}% (${badgeText})</span></td>
                        <td>${data.score} / ${data.totalQuestions}</td>
                        <td>${date}</td>
                    </tr>
                `;
            });
        }

        container.innerHTML = `
            <div class="card" style="padding: 2rem; min-height: 80vh;">
                <div class="admin-results-header">
                    <div>
                        <h2 style="margin-bottom:5px;">نتائج: ${examTitle}</h2>
                        <p class="text-muted">عدد الطلاب: ${snapshot.size}</p>
                    </div>
                    <button class="btn-secondary" onclick="switchTab(event, 'exams')"><i class="fas fa-arrow-right"></i> عودة</button>
                </div>
                
                <div class="admin-results-table-wrapper">
                    <table class="results-table">
                        <thead>
                            <tr>
                                <th>الطالب</th>
                                <th>النتيجة (%)</th>
                                <th>الدرجة</th>
                                <th>تاريخ التسليم</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Error fetching results:", error);
        container.innerHTML = `<div style="text-align:center; padding: 50px; color: #ef4444;">
            <i class="fas fa-exclamation-triangle fa-2x"></i><br>
            حدث خطأ أثناء تحميل النتائج.<br>
            <small>${error.message}</small><br>
            <button class="btn-secondary" style="margin-top:15px;" onclick="switchTab(event, 'exams')">عودة</button>
        </div>`;
    }
}

// Add new functions to global scope
window.startExam = startExam;
window.navigateExam = navigateExam;
window.submitExam = submitExam;
window.jumpToQuestion = jumpToQuestion;