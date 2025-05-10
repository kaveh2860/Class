/* ==========================================================================
   مدیریت کلاس خصوصی - اسکریپت پیشرفته نسخه 2.0.1 (با IndexedDB)
   ========================================================================== */
(function () {
    'use strict';

    // --- Configuration ---
    const DB_NAME = 'PrivateClassManagerDB';
    const DB_VERSION = 2; // Increment this if schema changes
    const STORE_STUDENTS = 'students';
    const STORE_CLASSES = 'classes';
    const STORE_PAYMENTS = 'payments';
    const SETTINGS_KEY = 'appSettings';
    const LAST_BACKUP_KEY = 'lastBackupTimestamp';
    const DEBT_AMOUNT_THRESHOLD = 200000; // آستانه بدهکاری برای نمایش مبلغ ۲۰۰ هزار تومان

    // --- DOM Elements Cache ---
    const elements = {}; // Cache for frequently used elements

    // --- Application State ---
    let db = null; // IndexedDB database instance
    let currentViewStudentId = null; // ID of the student being viewed on page 2
    let currentViewStudentName = null; // Name for display
    let currentClassList = []; // Holds currently displayed class data for sorting/filtering
    let currentPaymentList = []; // Holds currently displayed payment data
    let currentReportData = []; // Holds currently displayed report data
    let currentAppSettings = { // Default settings
        theme: 'light',
        defaultClassCost: ''
    };
    let currentSort = { // Sorting state for tables
        class: { column: 'date', direction: 'desc' },
        payment: { column: 'date', direction: 'desc' },
    };
    let selectedClassIds = new Set();
    let selectedPaymentIds = new Set();

    // --- Utility Functions ---
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => document.querySelectorAll(selector);

    function cacheElements() {
        const ids = [
            'themeToggleBtn', 'exportDataBtn', 'importDataInput', 'settingsBtn', 'loadingIndicator', 'toastNotification', 'toastMessage', 'toastCloseBtn',
            'page1', 'page2', 'addStudentForm', 'nameInput', 'addNameBtn', 'searchInput', 'nameList', 'nameListEmpty',
            'selectedName', 'lastActivityDate', 'backBtn', 'studentList',
            'tabBtnClass', 'tabBtnCost', 'tabBtnReport',
            'classPanel', 'addClassForm', 'classStudentCheckboxes', 'classDay', 'classDate', 'classCost', 'classNotes', 'addClassBtn', 'classList', 'classTable', 'classListEmpty', 'selectAllClasses', 'bulkDeleteClassesBtn', 'classFilterStartDate', 'classFilterEndDate', 'applyClassFilterBtn', 'clearClassFilterBtn',
            'costPanel', 'addPaymentForm', 'costStudentCheckboxes', 'paymentDay', 'paymentDate', 'paymentAmount', 'paymentNotes', 'addPaymentBtn', 'paymentList', 'paymentTable', 'paymentListEmpty', 'selectAllPayments', 'bulkDeletePaymentsBtn', 'paymentFilterStartDate', 'paymentFilterEndDate', 'applyPaymentFilterBtn', 'clearPaymentFilterBtn',
            'reportPanel', 'reportFilterStartDate', 'reportFilterEndDate', 'applyReportFilterBtn', 'clearReportFilterBtn', 'reportTable', 'reportTableBody', 'reportTableFooter', 'reportTableEmpty',
            'deleteDialog', 'deleteDialogTitle', 'deleteDialogMessage', 'confirmDeleteBtn', 'cancelDeleteBtn',
            'editStudentDialog', 'editStudentForm', 'editStudentDialogTitle', 'editStudentNameInput', 'confirmEditStudentBtn', 'cancelEditStudentBtn',
            'editEntryDialog', 'editEntryForm', 'editEntryDialogTitle', 'editEntryType', 'editEntryId', 'editEntryDay', 'editEntryDate', 'editEntryValueLabel', 'editEntryValue', 'editEntryNotes', 'confirmEditEntryBtn', 'cancelEditEntryBtn',
            'settingsDialog', 'settingsForm', 'settingsDialogTitle', 'defaultClassCost', 'saveSettingsBtn', 'cancelSettingsBtn',
            'errorDialog', 'errorDialogTitle', 'errorDialogMessage', 'closeErrorBtn',
            'importConfirmDialog', 'importConfirmDialogTitle', 'importConfirmMessage', 'importSummary', 'confirmImportBtn', 'cancelImportBtn',
            'overlay', 'appFooter', 'lastBackupDate'
        ];
        ids.forEach(id => elements[id] = $(`#${id}`));
    }

    function showLoading(message = 'در حال پردازش...') {
        if (elements.loadingIndicator) {
            elements.loadingIndicator.querySelector('span').textContent = message;
            elements.loadingIndicator.classList.add('show');
            elements.loadingIndicator.setAttribute('aria-hidden', 'false');
            elements.loadingIndicator.setAttribute('aria-busy', 'true');
        }
    }

    function hideLoading() {
        if (elements.loadingIndicator) {
            elements.loadingIndicator.classList.remove('show');
            elements.loadingIndicator.setAttribute('aria-hidden', 'true');
            elements.loadingIndicator.setAttribute('aria-busy', 'false');
        }
    }

    let toastTimeout;
    function showToast(message, type = 'info', duration = 4000) {
        if (!elements.toastNotification || !elements.toastMessage) return;
        clearTimeout(toastTimeout);

        elements.toastMessage.textContent = message;
        elements.toastNotification.className = 'toast'; // Reset classes
        elements.toastNotification.classList.add(type); // Add type class (success, error, info)
        elements.toastNotification.classList.add('show');

        toastTimeout = setTimeout(() => {
            elements.toastNotification.classList.remove('show');
        }, duration);
    }

    function closeToast() {
        clearTimeout(toastTimeout);
        if (elements.toastNotification) elements.toastNotification.classList.remove('show');
    }

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function toPersianDigits(str) {
        if (str === null || str === undefined) return '';
        const map = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        return String(str).replace(/[0-9]/g, (m) => map[parseInt(m)]);
    }

    function formatCurrency(amount) {
        const num = Number(amount);
        if (amount === null || amount === undefined || amount === '' || isNaN(num)) return '-';
        const formatted = Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return toPersianDigits(formatted);
    }

    function gregorianToShamsi(gregorianDateStr) {
      if (!gregorianDateStr) return '-';
      const date = new Date(gregorianDateStr);
      if (isNaN(date.getTime())) return '-'; 

      let gy = date.getFullYear();
      let gm = date.getMonth() + 1;
      let gd = date.getDate();
      var g_d_m, jy, jm, jd, gy2, days;
      g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
      gy2 = (gm > 2) ? (gy + 1) : gy;
      days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
      jy = -1595 + (33 * Math.floor(days / 12053));
      days %= 12053;
      jy += 4 * Math.floor(days / 1461);
      days %= 1461;
      if (days > 365) {
        jy += Math.floor((days - 1) / 365);
        days = (days - 1) % 365;
      }
      if (days < 186) {
        jm = 1 + Math.floor(days / 31);
        jd = 1 + (days % 31);
      } else {
        jm = 7 + Math.floor((days - 186) / 30);
        jd = 1 + ((days - 186) % 30);
      }
      return `${toPersianDigits(jy)}/${toPersianDigits(String(jm).padStart(2, '0'))}/${toPersianDigits(String(jd).padStart(2, '0'))}`;
    }

    function getDayOfWeekName(dateString) {
        if (!dateString) return "";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "";
        const dayIndex = date.getDay();
        const persianDays = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
        return persianDays[(dayIndex) % 7]; 
    }

    function getTodayDateString() {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }

    function formatDateForFilename(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}_${hours}-${minutes}`;
    }

    // --- IndexedDB Database Operations ---
    function initDB() {
        return new Promise((resolve, reject) => {
            if (db) {
                resolve(db);
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("Database error:", event.target.error);
                reject(`خطای پایگاه داده: ${event.target.error}`);
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log("Database opened successfully.");
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                console.log("Database upgrade needed.");
                db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_STUDENTS)) {
                    const studentStore = db.createObjectStore(STORE_STUDENTS, { keyPath: 'id', autoIncrement: true });
                    studentStore.createIndex('nameIdx', 'name', { unique: true });
                    console.log(`Object store ${STORE_STUDENTS} created.`);
                }
                if (!db.objectStoreNames.contains(STORE_CLASSES)) {
                    const classStore = db.createObjectStore(STORE_CLASSES, { keyPath: 'id', autoIncrement: true });
                    classStore.createIndex('studentIdIdx', 'studentId', { unique: false });
                    classStore.createIndex('dateIdx', 'date', { unique: false });
                    console.log(`Object store ${STORE_CLASSES} created.`);
                }
                if (!db.objectStoreNames.contains(STORE_PAYMENTS)) {
                    const paymentStore = db.createObjectStore(STORE_PAYMENTS, { keyPath: 'id', autoIncrement: true });
                    paymentStore.createIndex('studentIdIdx', 'studentId', { unique: false });
                    paymentStore.createIndex('dateIdx', 'date', { unique: false });
                    console.log(`Object store ${STORE_PAYMENTS} created.`);
                }
            };
        });
    }

    function performDBAction(storeName, mode, action) {
        return new Promise(async (resolve, reject) => {
            try {
                const currentDb = await initDB(); 
                const transaction = currentDb.transaction(storeName, mode);
                const store = transaction.objectStore(storeName);
                action(store, resolve, reject); 

                transaction.oncomplete = () => {
                   if (mode === 'readwrite') {
                        // console.log(`Transaction complete for ${storeName} (${mode})`);
                   }
                };
                transaction.onerror = (event) => {
                    console.error(`Transaction error on ${storeName}:`, event.target.error);
                    reject(`خطای تراکنش در ${storeName}: ${event.target.error}`);
                };
            } catch (error) {
                reject(error); 
            }
        });
    }

    // --- Student CRUD ---
    function addStudent(student) { 
        return performDBAction(STORE_STUDENTS, 'readwrite', (store, resolve, reject) => {
            const index = store.index('nameIdx');
            const getRequest = index.get(student.name);

            getRequest.onsuccess = (event) => {
                if (event.target.result) {
                    reject(new Error(`نام "${escapeHtml(student.name)}" قبلاً ثبت شده است.`));
                } else {
                    const addRequest = store.add(student);
                    addRequest.onsuccess = (event) => resolve(event.target.result); 
                    addRequest.onerror = (event) => reject(event.target.error);
                }
            };
            getRequest.onerror = (event) => reject(event.target.error);
        });
    }

    function getStudent(id) {
        return performDBAction(STORE_STUDENTS, 'readonly', (store, resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = (event) => resolve(event.target.result); 
            request.onerror = (event) => reject(event.target.error);
        });
    }

     function getAllStudents() {
        return performDBAction(STORE_STUDENTS, 'readonly', (store, resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = (event) => {
                 const sortedStudents = event.target.result.sort((a, b) =>
                     a.name.localeCompare(b.name, 'fa')
                 );
                resolve(sortedStudents);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    function updateStudent(student) { 
        return performDBAction(STORE_STUDENTS, 'readwrite', (store, resolve, reject) => {
            const request = store.put(student);
            request.onsuccess = (event) => resolve(event.target.result); 
            request.onerror = (event) => reject(event.target.error);
        });
    }

    function deleteStudent(id) {
        return performDBAction(STORE_STUDENTS, 'readwrite', (store, resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function deleteStudentAndData(studentId) {
        try {
            const db = await initDB();
            const tx = db.transaction([STORE_STUDENTS, STORE_CLASSES, STORE_PAYMENTS], 'readwrite');
            const studentStore = tx.objectStore(STORE_STUDENTS);
            const classStore = tx.objectStore(STORE_CLASSES);
            const paymentStore = tx.objectStore(STORE_PAYMENTS);
            const classIndex = classStore.index('studentIdIdx');
            const paymentIndex = paymentStore.index('studentIdIdx');

            studentStore.delete(studentId);

            const classCursorReq = classIndex.openCursor(IDBKeyRange.only(studentId));
            classCursorReq.onsuccess = event => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            const paymentCursorReq = paymentIndex.openCursor(IDBKeyRange.only(studentId));
            paymentCursorReq.onsuccess = event => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            return new Promise((resolve, reject) => {
                 tx.oncomplete = () => resolve();
                 tx.onerror = (event) => reject(event.target.error);
            });

        } catch (error) {
            console.error("Error deleting student and data:", error);
            throw error; 
        }
    }

    // --- Class CRUD ---
     function addClass(classData) { 
        return performDBAction(STORE_CLASSES, 'readwrite', (store, resolve, reject) => {
            const request = store.add(classData);
            request.onsuccess = (event) => resolve(event.target.result); 
            request.onerror = (event) => reject(event.target.error);
        });
    }

    function getClassesByStudent(studentId, startDate = null, endDate = null) {
        return performDBAction(STORE_CLASSES, 'readonly', (store, resolve, reject) => {
            const index = store.index('studentIdIdx');
            let range = IDBKeyRange.only(studentId); 

            const request = index.getAll(range);
            request.onsuccess = (event) => {
                let results = event.target.result || [];
                if (startDate) {
                    results = results.filter(c => c.date >= startDate);
                }
                if (endDate) {
                     const endOfDay = new Date(endDate);
                     endOfDay.setHours(23, 59, 59, 999);
                     const endOfDayStr = endOfDay.toISOString().split('T')[0]; 
                     results = results.filter(c => c.date <= endOfDayStr);
                }
                 resolve(results);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

     function updateClass(classData) { 
        return performDBAction(STORE_CLASSES, 'readwrite', (store, resolve, reject) => {
            const request = store.put(classData);
            request.onsuccess = (event) => resolve(event.target.result); 
            request.onerror = (event) => reject(event.target.error);
        });
    }

     function deleteClass(id) {
        return performDBAction(STORE_CLASSES, 'readwrite', (store, resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

     function deleteClasses(ids) { 
         return performDBAction(STORE_CLASSES, 'readwrite', (store, resolve, reject) => {
             let deleteCount = 0;
             ids.forEach(id => {
                 const request = store.delete(id);
                 request.onsuccess = () => {
                     deleteCount++;
                     if (deleteCount === ids.size) { 
                         resolve();
                     }
                 };
             });
             if (ids.size === 0) resolve(); 
         });
     }

    // --- Payment CRUD ---
    function addPayment(paymentData) { 
        return performDBAction(STORE_PAYMENTS, 'readwrite', (store, resolve, reject) => {
            const request = store.add(paymentData);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    function getPaymentsByStudent(studentId, startDate = null, endDate = null) {
        return performDBAction(STORE_PAYMENTS, 'readonly', (store, resolve, reject) => {
            const index = store.index('studentIdIdx');
            const range = IDBKeyRange.only(studentId);
            const request = index.getAll(range);
            request.onsuccess = (event) => {
                let results = event.target.result || [];
                 if (startDate) {
                    results = results.filter(p => p.date >= startDate);
                }
                 if (endDate) {
                     const endOfDay = new Date(endDate);
                     endOfDay.setHours(23, 59, 59, 999);
                     const endOfDayStr = endOfDay.toISOString().split('T')[0];
                     results = results.filter(p => p.date <= endOfDayStr);
                }
                resolve(results);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    function updatePayment(paymentData) { 
         return performDBAction(STORE_PAYMENTS, 'readwrite', (store, resolve, reject) => {
            const request = store.put(paymentData);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    function deletePayment(id) {
         return performDBAction(STORE_PAYMENTS, 'readwrite', (store, resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

     function deletePayments(ids) { 
         return performDBAction(STORE_PAYMENTS, 'readwrite', (store, resolve, reject) => {
             let deleteCount = 0;
             ids.forEach(id => {
                 const request = store.delete(id);
                 request.onsuccess = () => {
                     deleteCount++;
                     if (deleteCount === ids.size) {
                         resolve();
                     }
                 };
             });
              if (ids.size === 0) resolve();
         });
     }

    // --- START: New function to get student financial status ---
    async function getStudentFinancialStatus(studentId) {
        try {
            const classes = await getClassesByStudent(studentId);
            const payments = await getPaymentsByStudent(studentId);

            let totalCost = 0;
            classes.forEach(c => {
                // Ensure memberName is considered for group students
                if (!currentViewStudentName || !currentViewStudentName.includes(" و ") || c.memberName === currentViewStudentName.split(' و ').find(name => name.trim() === c.memberName) || c.studentId === studentId) { // simplified logic, might need refinement for exact group member accounting if classes are not duplicated per member
                    totalCost += Number(c.cost) || 0;
                }
            });


            let totalPaid = 0;
            payments.forEach(p => {
                 // Ensure memberName is considered for group students
                if (!currentViewStudentName || !currentViewStudentName.includes(" و ") || p.memberName === currentViewStudentName.split(' و ').find(name => name.trim() === p.memberName) || p.studentId === studentId) { // simplified logic
                    totalPaid += Number(p.amount) || 0;
                }
            });

            const balance = totalPaid - totalCost; // Positive: بستانکار, Negative: بدهکار

            if (balance < 0) {
                // مبلغ بدهی را محاسبه می‌کنیم (مقدار مطلق بدهی)
                const debtAmount = Math.abs(balance);
                // اگر بدهی بیشتر یا مساوی آستانه تعریف شده (مثلا ۲۰۰ هزار) بود
                if (debtAmount >= DEBT_AMOUNT_THRESHOLD) {
                     return {
                        status: 'debtor',
                        // message: `${formatCurrency(DEBT_AMOUNT_THRESHOLD)} تومان بدهکار` // نمایش مبلغ ثابت ۲۰۰ هزار
                        message: `${formatCurrency(debtAmount)} تومان بدهکار` // نمایش مبلغ دقیق بدهی
                    };
                } else { // اگر بدهی کمتر از آستانه بود
                     return {
                        status: 'debtor',
                        message: `${formatCurrency(debtAmount)} تومان بدهکار`
                    };
                }
            } else if (balance === 0 && totalCost > 0) { // تسویه در صورتی که هزینه ای وجود داشته باشد
                return { status: 'settled', message: 'تسویه کرده' };
            } else if (balance > 0) {
                return { status: 'credit', message: `${formatCurrency(balance)} تومان بستانکار` }; // وضعیت بستانکار
            } else { // (balance === 0 && totalCost === 0)
                return { status: 'no_activity', message: '' }; // هنوز فعالیتی نداشته یا همه چیز صفر است
            }

        } catch (error) {
            console.error(`Error calculating financial status for student ${studentId}:`, error);
            return { status: 'error', message: 'خطا در محاسبه' };
        }
    }
    // --- END: New function ---


    // --- Settings Load/Save ---
    function loadSettings() {
        try {
            const storedSettings = localStorage.getItem(SETTINGS_KEY);
            if (storedSettings) {
                currentAppSettings = { ...currentAppSettings, ...JSON.parse(storedSettings) };
            }
        } catch (e) {
            console.error("Error loading settings:", e);
        }
         applyTheme(currentAppSettings.theme);
         updateLastBackupDateDisplay(); 
    }

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentAppSettings));
        } catch (e) {
            console.error("Error saving settings:", e);
            showToast("خطا در ذخیره تنظیمات.", 'error');
        }
    }

     function updateLastBackupDateDisplay() {
         const timestamp = localStorage.getItem(LAST_BACKUP_KEY);
         if (elements.lastBackupDate) {
             if (timestamp) {
                 const date = new Date(parseInt(timestamp));
                 const formattedDate = `${gregorianToShamsi(date.toISOString().split('T')[0])} ساعت ${toPersianDigits(date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}`;
                 elements.lastBackupDate.textContent = `آخرین پشتیبان‌گیری: ${formattedDate}`;
             } else {
                 elements.lastBackupDate.textContent = `آخرین پشتیبان‌گیری: هرگز`;
             }
         }
     }

     function recordBackupTimestamp() {
         try {
             localStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
             updateLastBackupDateDisplay();
         } catch (e) {
             console.error("Error saving backup timestamp:", e);
         }
     }


    // --- UI Rendering Functions ---

    // --- START: Modified renderNameList function ---
    async function renderNameList(students) { // Made async
        if (!elements.nameList || !elements.nameListEmpty) return;
        elements.nameList.innerHTML = '';
        selectedClassIds.clear();
        selectedPaymentIds.clear();

        if (!students || students.length === 0) {
            elements.nameListEmpty.classList.add('active');
            return;
        }

        elements.nameListEmpty.classList.remove('active');
        const fragment = document.createDocumentFragment();

        for (const student of students) { // Use for...of for async/await inside loop
            const listItem = document.createElement('div');
            listItem.className = 'list-item';
            listItem.dataset.id = student.id;
            listItem.dataset.name = student.name;

            // Get financial status
            // Pass student.id to getStudentFinancialStatus
            const financialStatus = await getStudentFinancialStatus(student.id); 
            let statusHtml = '';
            if (financialStatus.status === 'debtor') {
                statusHtml = `<span class="financial-status status-debtor">${escapeHtml(financialStatus.message)}</span>`;
            } else if (financialStatus.status === 'settled') {
                statusHtml = `<span class="financial-status status-settled">${escapeHtml(financialStatus.message)}</span>`;
            } else if (financialStatus.status === 'credit') {
                // Optionally, you can display a credit status too, or treat it like 'settled' for the main list.
                // For now, let's assume credit is like settled for the red/green display logic, or add a new color.
                // statusHtml = `<span class="financial-status status-credit">${escapeHtml(financialStatus.message)}</span>`;
                // If you want credit to also show as "تسویه کرده" or a specific green message:
                 statusHtml = `<span class="financial-status status-settled">${escapeHtml(financialStatus.message)}</span>`; // یا یک پیام دیگر
            }
            // No message for 'no_activity' or 'error' by default in the list item for brevity

            listItem.innerHTML = `
                <div class="list-item-main-info">
                    <span class="list-item-name">${escapeHtml(student.name)}</span>
                    ${statusHtml}
                </div>
                <div class="actions">
                    <button class="icon-btn warning-btn" data-action="edit-student" title="ویرایش نام">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="icon-btn danger-btn" data-action="delete-student" title="حذف دانش آموز و تمام اطلاعاتش">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="icon-btn primary-btn" data-action="details" title="مشاهده جزئیات و ثبت کلاس/پرداخت">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                </div>
            `;
            fragment.appendChild(listItem);
        }
        elements.nameList.appendChild(fragment);
    }
    // --- END: Modified renderNameList function ---

    function updateCheckboxes(studentId, studentName) {
         const isGroup = studentName.includes(" و ");
         const members = isGroup ? studentName.split(' و ').map(n => n.trim()) : [studentName];
         let checkboxesHTML = '';

         if (members.length === 0) {
            checkboxesHTML = '<p class="placeholder">خطا: نام دانش آموز نامعتبر.</p>';
         } else if (members.length === 1) {
             const escapedName = escapeHtml(members[0]);
             checkboxesHTML = `<label><input type="checkbox" name="students" value="${studentId}" data-name="${escapedName}" checked> ${escapedName}</label>`;
         } else {
             checkboxesHTML = members.map(name => {
                const escapedName = escapeHtml(name);
                return `<label><input type="checkbox" name="students" value="${studentId}" data-member-name="${escapedName}" checked> ${escapedName}</label>`;
             }).join('');
         }
         if (elements.classStudentCheckboxes) elements.classStudentCheckboxes.innerHTML = checkboxesHTML;
         if (elements.costStudentCheckboxes) elements.costStudentCheckboxes.innerHTML = checkboxesHTML;

         if (elements.studentList) {
             if (isGroup) {
                elements.studentList.innerHTML = members.map(name => `<span>${escapeHtml(name)}</span>`).join('');
                elements.studentList.style.display = 'flex';
             } else {
                 elements.studentList.innerHTML = '';
                 elements.studentList.style.display = 'none';
             }
         }
    }

    function createTableRow(item, type) {
        const row = document.createElement('tr');
        row.dataset.id = item.id; 
        const shamsiDate = gregorianToShamsi(item.date);
        const studentNameToDisplay = item.memberName || item.studentName || currentViewStudentName || '...';
        const escapedStudentName = escapeHtml(studentNameToDisplay);
        const noteTitle = escapeHtml(item.notes || '');
        const truncatedNote = noteTitle.length > 30 ? noteTitle.substring(0, 27) + '...' : noteTitle;

        let valueCell = '';
        let value = '';
        let dataSortValue = '';
        if (type === 'class') {
            value = formatCurrency(item.cost);
            valueCell = `<td class="numeric report-cost">${value}</td>`;
            dataSortValue = item.cost;
        } else if (type === 'payment') {
            value = formatCurrency(item.amount);
            valueCell = `<td class="numeric report-payment">${value}</td>`;
            dataSortValue = item.amount;
        }

        row.innerHTML = `
            <td class="checkbox-col"><input type="checkbox" class="row-select" data-id="${item.id}" aria-label="انتخاب ردیف ${item.id}"></td>
            <td>${escapedStudentName}</td>
            <td>${escapeHtml(item.day)}</td>
            <td data-sort-value="${item.date}">${shamsiDate}</td>
            ${valueCell.replace('<td ', `<td data-sort-value="${dataSortValue}" `)}
            <td ${noteTitle ? `title="${noteTitle}"` : ''} class="note-content">${truncatedNote || '-'}</td>
            <td class="actions-col">
                <div class="actions">
                     <button class="icon-btn primary-btn btn-duplicate" data-action="duplicate-${type}" title="کپی کردن این رکورد">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="icon-btn warning-btn" data-action="edit-${type}" title="ویرایش رکورد">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="icon-btn danger-btn" data-action="delete-${type}" title="حذف رکورد">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        return row;
    }

    function renderTable(tbodyElement, emptyElement, data, type, sortColumn, sortDirection) {
         if (!tbodyElement || !emptyElement) return;
         tbodyElement.innerHTML = '';
         selectedClassIds.clear(); 
         selectedPaymentIds.clear();
         updateBulkDeleteButtonState(); 

         if (!data || data.length === 0) {
             emptyElement.classList.add('active');
             tbodyElement.classList.remove('active'); 
             return;
         }

         emptyElement.classList.remove('active');
         tbodyElement.classList.add('active');

        const sortedData = [...data].sort((a, b) => {
             let valA = a[sortColumn];
             let valB = b[sortColumn];

             if (sortColumn === 'date') {
                 valA = new Date(valA);
                 valB = new Date(valB);
             } else if (sortColumn === 'cost' || sortColumn === 'amount') {
                 valA = Number(valA) || 0;
                 valB = Number(valB) || 0;
             } else {
                 valA = String(valA || '').toLowerCase();
                 valB = String(valB || '').toLowerCase();
                 return sortDirection === 'asc'
                     ? valA.localeCompare(valB, 'fa')
                     : valB.localeCompare(valA, 'fa');
             }

             if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
             if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
             return 0;
         });

         const fragment = document.createDocumentFragment();
         sortedData.forEach(item => {
             if (!item.studentName && currentViewStudentName) {
                item.studentName = currentViewStudentName;
             }
             fragment.appendChild(createTableRow(item, type));
         });
         tbodyElement.appendChild(fragment);
         updateTableSortHeaders(type); 
    }

    function updateTableSortHeaders(type) {
        const tableId = type === 'class' ? 'classTable' : 'paymentTable';
        const table = $(`#${tableId}`);
        if (!table) return;
        const currentSortState = currentSort[type];

        $$(`#${tableId} th.sortable`).forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            const sortIcon = th.querySelector('i.fa-sort');
            if (sortIcon) sortIcon.style.opacity = '0.5'; 

            if (th.dataset.sort === currentSortState.column) {
                th.classList.add(currentSortState.direction === 'asc' ? 'sort-asc' : 'sort-desc');
                 if (sortIcon) sortIcon.style.opacity = '1';
            }
        });
    }


async function renderReportTable(studentId, startDate = null, endDate = null) {
    if (!elements.reportTableBody || !elements.reportTableFooter || !elements.reportTableEmpty) return;
    showLoading("در حال تولید گزارش...");
    elements.reportTableBody.innerHTML = '';
    elements.reportTableFooter.innerHTML = '';
    elements.reportTableBody.classList.remove('active');
    elements.reportTableEmpty.classList.remove('active');
    
    try {
        const [allClasses, allPayments] = await Promise.all([
            getClassesByStudent(studentId, startDate, endDate),
            getPaymentsByStudent(studentId, startDate, endDate)
        ]);
        
        if (allClasses.length === 0 && allPayments.length === 0) {
            elements.reportTableEmpty.classList.add('active');
            hideLoading();
            return;
        }
        
        elements.reportTableBody.classList.add('active');
        
        const allEntries = [
            ...allClasses.map(c => ({ ...c, type: 'class', dateObj: new Date(c.date) })),
            ...allPayments.map(p => ({ ...p, type: 'payment', dateObj: new Date(p.date) }))
        ].sort((a, b) => a.dateObj - b.dateObj);
        
        const studentInfo = await getStudent(studentId); // دریافت اطلاعات دانش آموز برای نام دقیق
        const currentNameForReport = studentInfo ? studentInfo.name : currentViewStudentName; // استفاده از نام دقیق تر
        
        const isGroup = currentNameForReport && currentNameForReport.includes(" و ");
        const members = isGroup ? currentNameForReport.split(' و ').map(n => n.trim()) : [currentNameForReport];
        
        let grandTotalCost = 0;
        let grandTotalPaid = 0;
        const fragment = document.createDocumentFragment();
        
        // اگر دانش آموز تکی است، یک بار اطلاعات را برای او نمایش بده
        if (!isGroup || members.length === 1) {
            let studentTotalCost = 0;
            let studentTotalPaid = 0;
            
            allEntries.forEach(entry => {
                // برای دانش آموز تکی، همه رکوردها متعلق به او هستند
                const nameToShow = entry.memberName || entry.studentName || currentNameForReport || '...';
                const row = document.createElement('tr');
                const shamsiDate = gregorianToShamsi(entry.date);
                const noteTitle = escapeHtml(entry.notes || '');
                const truncatedNote = noteTitle.length > 40 ? noteTitle.substring(0, 37) + '...' : noteTitle;
                let costCell = '-';
                let paymentCell = '-';
                
                if (entry.type === 'class') {
                    const cost = Number(entry.cost) || 0;
                    studentTotalCost += cost;
                    costCell = `<span class="report-cost">${formatCurrency(cost)}</span>`;
                } else {
                    const paid = Number(entry.amount) || 0;
                    studentTotalPaid += paid;
                    paymentCell = `<span class="report-payment">${formatCurrency(paid)}</span>`;
                }
                
                row.innerHTML = `
                    <td>${escapeHtml(nameToShow)}</td>
                    <td>${entry.type === 'class' ? 'کلاس' : 'پرداخت'}</td>
                    <td>${escapeHtml(entry.day)}</td>
                    <td>${shamsiDate}</td>
                    <td class="numeric">${costCell}</td>
                    <td class="numeric">${paymentCell}</td>
                    <td ${noteTitle ? `title="${noteTitle}"` : ''}>${truncatedNote || '-'}</td>
                `;
                fragment.appendChild(row);
            });
            grandTotalCost = studentTotalCost;
            grandTotalPaid = studentTotalPaid;
            
        } else { // اگر گروه چند نفره است، برای هر عضو جداگانه پردازش کن
            for (const memberName of members) {
                let memberTotalCost = 0;
                let memberTotalPaid = 0;
                let memberHasEntries = false;
                
                const memberHeaderRow = document.createElement('tr');
                memberHeaderRow.className = 'group-member-header';
                memberHeaderRow.innerHTML = `<td colspan="7"><strong>گزارش مالی برای: ${escapeHtml(memberName)}</strong></td>`;
                fragment.appendChild(memberHeaderRow);
                
                const memberEntries = allEntries.filter(entry => {
                    // فیلتر کردن رکوردها برای عضو فعلی گروه
                    return entry.memberName === memberName || (!entry.memberName && entry.studentName === currentNameForReport);
                });
                
                memberEntries.forEach(entry => {
                    memberHasEntries = true;
                    const row = document.createElement('tr');
                    const shamsiDate = gregorianToShamsi(entry.date);
                    const noteTitle = escapeHtml(entry.notes || '');
                    const truncatedNote = noteTitle.length > 40 ? noteTitle.substring(0, 37) + '...' : noteTitle;
                    let costCell = '-';
                    let paymentCell = '-';
                    
                    if (entry.type === 'class') {
                        const cost = Number(entry.cost) || 0;
                        memberTotalCost += cost;
                        costCell = `<span class="report-cost">${formatCurrency(cost)}</span>`;
                    } else {
                        const paid = Number(entry.amount) || 0;
                        memberTotalPaid += paid;
                        paymentCell = `<span class="report-payment">${formatCurrency(paid)}</span>`;
                    }
                    
                    row.innerHTML = `
                        <td>${escapeHtml(memberName)}</td> 
                        <td>${entry.type === 'class' ? 'کلاس' : 'پرداخت'}</td>
                        <td>${escapeHtml(entry.day)}</td>
                        <td>${shamsiDate}</td>
                        <td class="numeric">${costCell}</td>
                        <td class="numeric">${paymentCell}</td>
                        <td ${noteTitle ? `title="${noteTitle}"` : ''}>${truncatedNote || '-'}</td>
                    `;
                    fragment.appendChild(row);
                });
                
                if (memberHasEntries) {
                    grandTotalCost += memberTotalCost;
                    grandTotalPaid += memberTotalPaid;
                    const memberBalance = memberTotalCost - memberTotalPaid;
                    const balanceClass = memberBalance > 0 ? 'debt' : (memberBalance < 0 ? 'credit' : '');
                    
                    const memberTotalRow = document.createElement('tr');
                    memberTotalRow.className = 'group-member-total';
                    memberTotalRow.innerHTML = `
                        <td colspan="4"><strong>جمع کل برای ${escapeHtml(memberName)}</strong></td>
                        <td class="numeric report-cost"><strong>${formatCurrency(memberTotalCost)}</strong></td>
                        <td class="numeric report-payment"><strong>${formatCurrency(memberTotalPaid)}</strong></td>
                        <td><strong>مانده: <span class="report-balance ${balanceClass}">${formatCurrency(Math.abs(memberBalance))}</span></strong></td>
                    `;
                    fragment.appendChild(memberTotalRow);
                }
            }
        }
        
        elements.reportTableBody.appendChild(fragment);
        
        // فوتر همیشه یک بار نمایش داده می شود، چه برای دانش آموز تکی چه برای گروه
        const finalBalance = grandTotalCost - grandTotalPaid;
        const finalBalanceClass = finalBalance > 0 ? 'debt' : (finalBalance < 0 ? 'credit' : '');
        const footerRow = document.createElement('tr');
        footerRow.innerHTML = `
            <td colspan="4"><strong>${(isGroup && members.length > 1) ? 'جمع کل گروه' : 'جمع کل'}</strong></td>
            <td class="numeric report-cost"><strong>${formatCurrency(grandTotalCost)}</strong></td>
            <td class="numeric report-payment"><strong>${formatCurrency(grandTotalPaid)}</strong></td>
            <td><strong>مانده نهایی: <span class="report-balance ${finalBalanceClass}">${formatCurrency(Math.abs(finalBalance))}</span></strong></td>
        `;
        elements.reportTableFooter.appendChild(footerRow);
        
    } catch (error) {
        console.error("Error rendering report table:", error);
        showToast(`خطا در بارگذاری گزارش: ${error.message || error}`, 'error');
        elements.reportTableEmpty.classList.add('active');
        elements.reportTableBody.classList.remove('active');
    } finally {
        hideLoading();
    }
}


    // --- UI State & Navigation ---
    function showPage(pageId) {
        $$('.page').forEach(page => page.classList.remove('active'));
        const pageToShow = $(`#${pageId}`);
        if (pageToShow) {
            pageToShow.classList.add('active');
            window.scrollTo(0, 0); 
        }
    }

    function switchTab(panelId) {
        $$('.tab-content').forEach(panel => panel.classList.remove('active'));
        $$('.tab-button').forEach(button => {
            button.classList.remove('active'); 
            button.setAttribute('aria-selected', 'false');
        });

        const panelToShow = $(`#${panelId}`);
        const buttonToActivate = $(`[aria-controls="${panelId}"]`);

        if (panelToShow) panelToShow.classList.add('active'); 
        if (buttonToActivate) {
            buttonToActivate.classList.add('active'); 
            buttonToActivate.setAttribute('aria-selected', 'true');
        }

        selectedClassIds.clear();
        selectedPaymentIds.clear();
        updateBulkDeleteButtonState();
        $$('.row-select').forEach(cb => cb.checked = false);
        if(elements.selectAllClasses) elements.selectAllClasses.checked = false; // Added null check
        if(elements.selectAllPayments) elements.selectAllPayments.checked = false; // Added null check
    }


    function openDialog(dialogId) {
        closeAllDialogs(); 
        const dialog = $(`#${dialogId}`);
        if (dialog && elements.overlay) {
            elements.overlay.classList.add('active');
            dialog.classList.add('active');
            dialog.setAttribute('aria-hidden', 'false');
            const focusable = dialog.querySelector('input, select, textarea, button');
            if (focusable) requestAnimationFrame(() => focusable.focus());
        }
    }

    function closeAllDialogs() {
        $$('.dialog').forEach(dialog => {
             dialog.classList.remove('active');
             dialog.setAttribute('aria-hidden', 'true');
        });
        if (elements.overlay) elements.overlay.classList.remove('active');
    }

    function applyTheme(theme) {
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme'); 
        currentAppSettings.theme = theme;
        if (elements.themeToggleBtn) {
            const icon = elements.themeToggleBtn.querySelector('i');
            if (icon) {
                 icon.className = `fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`;
            }
        }
        $(`meta[name="theme-color"][media="(prefers-color-scheme: light)"]`)?.setAttribute('content', theme === 'light' ? '#ffffff' : '#2b3035');
        $(`meta[name="theme-color"][media="(prefers-color-scheme: dark)"]`)?.setAttribute('content', theme === 'dark' ? '#2b3035' : '#ffffff');
    }

    function toggleTheme() {
        const newTheme = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
        applyTheme(newTheme);
        saveSettings(); 
    }

    function updateBulkDeleteButtonState() {
        if(elements.bulkDeleteClassesBtn) {
            elements.bulkDeleteClassesBtn.disabled = selectedClassIds.size === 0;
        }
        if(elements.bulkDeletePaymentsBtn) {
             elements.bulkDeletePaymentsBtn.disabled = selectedPaymentIds.size === 0;
        }
    }

    // --- Event Handlers ---

    async function handleAddStudentSubmit(event) {
        event.preventDefault();
        const name = elements.nameInput.value.trim();
        if (!name) {
            showToast("لطفاً نام دانش آموز یا گروه را وارد کنید.", "error");
            elements.nameInput.focus();
            return;
        }
        showLoading("در حال افزودن...");
        try {
            const newStudent = { name: name };
            const newId = await addStudent(newStudent);
            showToast(`"${escapeHtml(name)}" با موفقیت اضافه شد.`, "success");
            elements.nameInput.value = '';
            await loadAndRenderStudents(); 
             const newItem = elements.nameList.querySelector(`.list-item[data-id="${newId}"]`);
             if(newItem) {
                 newItem.classList.add('item-added');
                 setTimeout(() => newItem.classList.remove('item-added'), 500);
             }
        } catch (error) {
            console.error("Error adding student:", error);
            showToast(error.message || "خطا در افزودن دانش آموز.", "error");
        } finally {
            hideLoading();
        }
    }

    async function handleSearchInput() {
        await loadAndRenderStudents(elements.searchInput.value.trim());
    }

    async function handleNameListActions(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const listItem = button.closest('.list-item');
        if (!listItem) return; // Ensure listItem exists
        const studentId = parseInt(listItem.dataset.id);
        const studentName = listItem.dataset.name; 
        const action = button.dataset.action;

        if (isNaN(studentId) || !studentName) {
            console.error("Invalid student ID or name on list item:", listItem.dataset);
            showToast("خطا در یافتن اطلاعات دانش آموز.", "error");
            return;
        }

        switch (action) {
            case 'details':
                await showDetailsPage(studentId, studentName);
                break;
            case 'edit-student':
                promptEditStudent(studentId, studentName);
                break;
            case 'delete-student':
                promptDeleteStudent(studentId, studentName, listItem);
                break;
        }
    }

async function showDetailsPage(studentId, studentName) {
    showLoading("در حال بارگذاری اطلاعات...");
    try {
        currentViewStudentId = studentId;
        currentViewStudentName = studentName;
        
        if (elements.selectedName) elements.selectedName.textContent = escapeHtml(studentName);
        updateCheckboxes(studentId, studentName);
        
        // ... (بقیه تنظیمات فرم و فیلترها) ...
        clearFilter('class');
        clearFilter('payment');
        clearFilter('report'); // اطمینان از پاک شدن فیلتر گزارش
        // ...
        
        // این بخش حیاتی است که فقط یک بار اطلاعات بارگذاری شود
        await Promise.all([
            loadAndRenderClasses(),
            loadAndRenderPayments(),
            loadAndRenderReport() // اولین بارگذاری گزارش هنگام ورود به صفحه جزئیات
        ]);
        
        await displayLastActivityDate(studentId);
        
        switchTab('classPanel');
        showPage('page2');
        
    } catch (error) {
        // ... (مدیریت خطا) ...
    } finally {
        hideLoading();
    }
}

     async function displayLastActivityDate(studentId) {
         if (!elements.lastActivityDate) return;
         try {
             const [lastClass] = await performDBAction(STORE_CLASSES, 'readonly', (store, resolve, reject) => {
                 const getAllReq = store.index('studentIdIdx').getAll(IDBKeyRange.only(studentId));
                 getAllReq.onsuccess = (event) => {
                    const studentClasses = event.target.result || [];
                    if (studentClasses.length > 0) {
                        const latestClass = studentClasses.sort((a,b) => b.date.localeCompare(a.date))[0];
                        resolve([latestClass]);
                    } else {
                        resolve([null]); 
                    }
                 };
                  getAllReq.onerror = (event) => reject(event.target.error);
             });
             const [lastPayment] = await performDBAction(STORE_PAYMENTS, 'readonly', (store, resolve, reject) => {
                  const getAllReq = store.index('studentIdIdx').getAll(IDBKeyRange.only(studentId));
                 getAllReq.onsuccess = (event) => {
                    const studentPayments = event.target.result || [];
                    if (studentPayments.length > 0) {
                        const latestPayment = studentPayments.sort((a,b) => b.date.localeCompare(a.date))[0];
                        resolve([latestPayment]);
                    } else {
                        resolve([null]); 
                    }
                 };
                  getAllReq.onerror = (event) => reject(event.target.error);
             });

             const lastClassDate = lastClass ? new Date(lastClass.date) : null;
             const lastPaymentDate = lastPayment ? new Date(lastPayment.date) : null;
             let lastActivity = null;

             if (lastClassDate && lastPaymentDate) {
                 lastActivity = lastClassDate > lastPaymentDate ? lastClassDate : lastPaymentDate;
             } else {
                 lastActivity = lastClassDate || lastPaymentDate;
             }

             if (lastActivity) {
                 elements.lastActivityDate.textContent = `آخرین فعالیت: ${gregorianToShamsi(lastActivity.toISOString().split('T')[0])}`;
             } else {
                 elements.lastActivityDate.textContent = 'آخرین فعالیت: --';
             }
         } catch (error) {
              console.error("Error fetching last activity date:", error);
              elements.lastActivityDate.textContent = 'خطا در بارگذاری آخرین فعالیت';
         }
     }

    function handleBack() {
        currentViewStudentId = null;
        currentViewStudentName = null;
        showPage('page1');
        loadAndRenderStudents(elements.searchInput?.value.trim() || ''); 
    }

    function handleTabSwitch(event) {
        const button = event.target.closest('.tab-button');
        if (button && button.getAttribute('aria-selected') !== 'true') {
            switchTab(button.getAttribute('aria-controls'));
        }
    }

    function handleAutoDaySelect(event) {
        const dateInput = event.target;
        let daySelect;

        if (dateInput.id === 'classDate') daySelect = elements.classDay;
        else if (dateInput.id === 'paymentDate') daySelect = elements.paymentDay;
        else if (dateInput.id === 'editEntryDate') daySelect = elements.editEntryDay;
        else return; 

        if (daySelect) {
            const dayName = getDayOfWeekName(dateInput.value);
            if (dayName) {
                daySelect.value = dayName;
            } else {
            }
        }
    }

    // --- Add/Edit/Delete Handlers ---
    async function handleAddClassFormSubmit(event) {
         event.preventDefault();
         const commonFormData = { 
             date: elements.classDate.value,
             day: elements.classDay.value,
             cost: elements.classCost.value,
             notes: elements.classNotes.value.trim(),
             studentId: currentViewStudentId, 
             studentName: currentViewStudentName 
         };

         if (!commonFormData.date) { showToast("لطفا تاریخ کلاس را انتخاب کنید.", "error"); elements.classDate.focus(); return; }
         if (!commonFormData.day) { showToast("لطفا روز هفته را انتخاب کنید.", "error"); elements.classDay.focus(); return; }
         if (commonFormData.cost === '' || isNaN(Number(commonFormData.cost)) || Number(commonFormData.cost) < 0) {
             showToast("لطفا هزینه کلاس معتبر وارد کنید (عدد مثبت یا صفر).", "error");
             elements.classCost.focus();
             return;
         }

         const selectedCheckboxes = elements.classStudentCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
         if (selectedCheckboxes.length === 0) {
             showToast("لطفاً حداقل یک دانش‌آموز را برای ثبت کلاس انتخاب کنید.", "error");
             return;
         }

         showLoading(`در حال ثبت ${toPersianDigits(selectedCheckboxes.length)} کلاس...`);
         let promises = []; 

         selectedCheckboxes.forEach(checkbox => {
             const memberName = checkbox.dataset.memberName || commonFormData.studentName;

             const classDataForMember = {
                 ...commonFormData, 
                 memberName: memberName, 
             };
             classDataForMember.cost = Number(classDataForMember.cost);

             promises.push(addClass(classDataForMember));
         });

         try {
             const results = await Promise.all(promises); 
             showToast(`${toPersianDigits(results.length)} کلاس با موفقیت ثبت شد.`, "success");

             event.target.reset(); 
             elements.classDate.value = getTodayDateString(); 
             handleAutoDaySelect({ target: elements.classDate }); 
             if(currentAppSettings.defaultClassCost) {
                 elements.classCost.value = currentAppSettings.defaultClassCost;
             } else {
                 elements.classCost.value = '';
             }
             updateCheckboxes(currentViewStudentId, currentViewStudentName);

             await loadAndRenderClasses(); 
             await loadAndRenderReport(); 
             await displayLastActivityDate(currentViewStudentId); 
             await loadAndRenderStudents(); // Refresh student list on page 1 to update financial status

         } catch (error) {
             console.error("Error adding multiple classes:", error);
             showToast(`خطا در ثبت برخی کلاس‌ها: ${error.message || error}`, "error");
         } finally {
             hideLoading();
         }
    }

    async function handleAddPaymentFormSubmit(event) {
         event.preventDefault();
         const commonFormData = { 
             date: elements.paymentDate.value,
             day: elements.paymentDay.value,
             amount: elements.paymentAmount.value,
             notes: elements.paymentNotes.value.trim(),
             studentId: currentViewStudentId, 
             studentName: currentViewStudentName 
         };

         if (!commonFormData.date) { showToast("لطفا تاریخ پرداخت را انتخاب کنید.", "error"); elements.paymentDate.focus(); return; }
         if (!commonFormData.day) { showToast("لطفا روز هفته را انتخاب کنید.", "error"); elements.paymentDay.focus(); return; }
         if (!commonFormData.amount || isNaN(Number(commonFormData.amount)) || Number(commonFormData.amount) <= 0) {
             showToast("لطفا مبلغ پرداخت معتبر (عدد مثبت) وارد کنید.", "error");
             elements.paymentAmount.focus();
             return;
         }

         const selectedCheckboxes = elements.costStudentCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
         if (selectedCheckboxes.length === 0) {
             showToast("لطفاً حداقل یک دانش‌آموز را برای ثبت پرداخت انتخاب کنید.", "error");
             return;
         }

         showLoading(`در حال ثبت ${toPersianDigits(selectedCheckboxes.length)} پرداخت...`);
         let promises = []; 

         selectedCheckboxes.forEach(checkbox => {
             const memberName = checkbox.dataset.memberName || commonFormData.studentName;
             const paymentDataForMember = {
                 ...commonFormData, 
                 memberName: memberName, 
             };
             paymentDataForMember.amount = Number(paymentDataForMember.amount);
             promises.push(addPayment(paymentDataForMember));
         });

         try {
             const results = await Promise.all(promises); 
             showToast(`${toPersianDigits(results.length)} پرداخت با موفقیت ثبت شد.`, "success");
             event.target.reset(); 
             elements.paymentDate.value = getTodayDateString(); 
             handleAutoDaySelect({ target: elements.paymentDate }); 
             elements.paymentAmount.value = ''; 
             updateCheckboxes(currentViewStudentId, currentViewStudentName);

             await loadAndRenderPayments(); 
             await loadAndRenderReport(); 
             await displayLastActivityDate(currentViewStudentId); 
             await loadAndRenderStudents(); // Refresh student list on page 1 to update financial status

         } catch (error) {
             console.error("Error adding multiple payments:", error);
             showToast(`خطا در ثبت برخی پرداخت‌ها: ${error.message || error}`, "error");
         } finally {
             hideLoading();
         }
    }

    // --- Edit/Delete Prompts and Handlers ---
     function promptEditStudent(studentId, studentName) {
         if(elements.editStudentNameInput) elements.editStudentNameInput.value = studentName;
         if(elements.editStudentForm) elements.editStudentForm.dataset.editingId = studentId;
         openDialog('editStudentDialog');
    }

    async function handleEditStudentSubmit(event) {
        event.preventDefault();
        const studentId = parseInt(elements.editStudentForm.dataset.editingId);
        const newName = elements.editStudentNameInput.value.trim();

        if (isNaN(studentId) || !newName) {
            showToast("اطلاعات نامعتبر است.", "error");
            return;
        }

        showLoading("در حال ویرایش نام...");
        try {
            const currentStudent = await getStudent(studentId);
            if (!currentStudent) throw new Error("دانش آموز یافت نشد.");

            if(currentStudent.name === newName) {
                closeAllDialogs();
                hideLoading();
                return;
            }

            const existingStudent = await performDBAction(STORE_STUDENTS, 'readonly', (store, resolve, reject) => {
                const index = store.index('nameIdx');
                const request = index.get(newName);
                request.onsuccess = (event) => resolve(event.target.result);
                request.onerror = (event) => reject(event.target.error);
            });

            if (existingStudent && existingStudent.id !== studentId) {
                throw new Error(`نام "${escapeHtml(newName)}" قبلاً برای دانش آموز دیگری ثبت شده است.`);
            }

            const updatedStudent = { id: studentId, name: newName };
            await updateStudent(updatedStudent);

            const oldNames = currentStudent.name.split(' و ').map(n => n.trim());
            const newNamesArr = newName.split(' و ').map(n => n.trim()); // Renamed to avoid conflict

            const updateMemberNames = async (storeName) => { // Removed valueField as it's not directly used here for memberName update logic
                const entries = await performDBAction(storeName, 'readonly', (store, resolve) => {
                    store.index('studentIdIdx').getAll(IDBKeyRange.only(studentId)).onsuccess = e => resolve(e.target.result);
                });

                for (const entry of entries) {
                    if (entry.memberName) { // Only update if memberName exists
                        const index = oldNames.findIndex(n => n === entry.memberName);
                        if (index !== -1 && newNamesArr[index]) { // Check if new name exists at the same index
                            entry.memberName = newNamesArr[index]; // Update to the new member name
                            // No need to update studentName here if it's a group name
                            await performDBAction(storeName, 'readwrite', (store, resolve) => { // Removed reject as it's not used by this simplified action
                                store.put(entry).onsuccess = () => resolve();
                            });
                        }
                    } else if (!entry.memberName && entry.studentName === currentStudent.name) { // if it's a single student or group entry without memberName
                         entry.studentName = newName; // Update the main studentName
                         await performDBAction(storeName, 'readwrite', (store, resolve) => {
                            store.put(entry).onsuccess = () => resolve();
                        });
                    }
                }
            };

            await updateMemberNames(STORE_CLASSES);
            await updateMemberNames(STORE_PAYMENTS);
           
            showToast("نام با موفقیت ویرایش شد.", "success");
            closeAllDialogs();
            await loadAndRenderStudents();

            if (currentViewStudentId === studentId) {
                currentViewStudentName = newName;
                if (elements.selectedName) elements.selectedName.textContent = escapeHtml(newName);
                // Refresh details page data if the edited student is currently viewed
                await loadAndRenderClasses();
                await loadAndRenderPayments();
                await loadAndRenderReport();
            }

        } catch (error) {
            console.error("Error editing student:", error);
            showToast(error.message || "خطا در ویرایش نام.", "error");
        } finally {
            hideLoading();
        }
    }


     function promptDeleteStudent(studentId, studentName, element) {
          if (elements.deleteDialogMessage) {
              elements.deleteDialogMessage.innerHTML = `آیا از حذف دانش آموز/گروه "<strong>${escapeHtml(studentName)}</strong>" و <u>تمام کلاس‌ها و پرداخت‌های مرتبط</u> مطمئن هستید؟ <br><strong>این عمل قابل بازگشت نیست!</strong>`;
          }
          elements.deleteDialog.dataset.deleteType = 'student';
          elements.deleteDialog.dataset.deleteId = studentId;
          elements.deleteDialog.dataset.deleteElementSelector = `.list-item[data-id="${studentId}"]`; 
          openDialog('deleteDialog');
      }

      function promptEditEntry(type, id) {
         const storeName = type === 'class' ? STORE_CLASSES : STORE_PAYMENTS;
         performDBAction(storeName, 'readonly', (store, resolve) => { // Removed reject as not used
             store.get(id).onsuccess = event => resolve(event.target.result);
         })
         .then(entry => {
             if (!entry) throw new Error("رکورد یافت نشد.");

             elements.editEntryType.value = type;
             elements.editEntryId.value = id;
             elements.editEntryDate.value = entry.date;
             elements.editEntryDay.value = entry.day;
             elements.editEntryNotes.value = entry.notes || '';

             if (type === 'class') {
                 elements.editEntryValueLabel.textContent = "هزینه کلاس (تومان):";
                 elements.editEntryValue.value = entry.cost;
                 elements.editEntryValue.min = "0";
                 elements.editEntryDialogTitle.innerHTML = '<i class="fas fa-edit"></i> ویرایش کلاس';
             } else { 
                 elements.editEntryValueLabel.textContent = "مبلغ پرداخت (تومان):";
                 elements.editEntryValue.value = entry.amount;
                 elements.editEntryValue.min = "1";
                  elements.editEntryDialogTitle.innerHTML = '<i class="fas fa-edit"></i> ویرایش پرداخت';
             }
             handleAutoDaySelect({target: elements.editEntryDate}); 
             openDialog('editEntryDialog');
         })
         .catch(error => {
             console.error(`Error fetching ${type} for edit:`, error);
             showToast(`خطا در بارگذاری اطلاعات برای ویرایش: ${error.message || error}`, 'error');
         });
     }

     async function handleEditEntrySubmit(event) {
         event.preventDefault();
         const type = elements.editEntryType.value;
         const id = parseInt(elements.editEntryId.value);
         const storeName = type === 'class' ? STORE_CLASSES : STORE_PAYMENTS;
         const valueKey = type === 'class' ? 'cost' : 'amount';
         const value = elements.editEntryValue.value;

         if (!type || isNaN(id)) { showToast("خطای داخلی در فرم ویرایش.", "error"); return; }
         if ((type === 'class' && (value === '' || isNaN(Number(value)) || Number(value) < 0)) || // Check for empty string for cost
             (type === 'payment' && (!value || isNaN(Number(value)) || Number(value) <= 0))) { // Check for falsy or non-positive for payment
             showToast("مقدار هزینه/مبلغ نامعتبر است.", "error");
             elements.editEntryValue.focus();
             return;
         }


         showLoading("در حال ذخیره تغییرات...");
         try {
             const existingEntry = await performDBAction(storeName, 'readonly', (store, resolve) => store.get(id).onsuccess = e => resolve(e.target.result));
             if (!existingEntry) throw new Error("رکورد اصلی یافت نشد.");

             const updatedEntry = {
                 ...existingEntry, 
                 date: elements.editEntryDate.value,
                 day: elements.editEntryDay.value,
                 [valueKey]: Number(value), // Ensure it's stored as a number
                 notes: elements.editEntryNotes.value.trim()
             };

             if (type === 'class') {
                 await updateClass(updatedEntry);
             } else {
                 await updatePayment(updatedEntry);
             }

             showToast("تغییرات با موفقیت ذخیره شد.", "success");
             closeAllDialogs();

             if (type === 'class') await loadAndRenderClasses();
             else await loadAndRenderPayments();
             await loadAndRenderReport();
             await displayLastActivityDate(currentViewStudentId); 
             await loadAndRenderStudents(); // Refresh student list on page 1 to update financial status

         } catch (error) {
             console.error(`Error updating ${type}:`, error);
             showToast(`خطا در ذخیره تغییرات: ${error.message || error}`, "error");
         } finally {
             hideLoading();
         }
     }


     function promptDeleteEntry(type, id, element) {
         const storeName = type === 'class' ? STORE_CLASSES : STORE_PAYMENTS;
         const typeText = type === 'class' ? 'کلاس' : 'پرداخت';

         performDBAction(storeName, 'readonly', (store, resolve) => store.get(id).onsuccess = e => resolve(e.target.result))
         .then(entry => {
             if (!entry) throw new Error("رکورد یافت نشد.");
             const shamsiDate = gregorianToShamsi(entry.date);
             const value = type === 'class' ? formatCurrency(entry.cost) : formatCurrency(entry.amount);
             const valueTypeText = type === 'class' ? 'هزینه' : 'مبلغ';

             if (elements.deleteDialogMessage) {
                 elements.deleteDialogMessage.innerHTML = `آیا از حذف ${typeText} (${escapeHtml(entry.day)} ${shamsiDate} - ${valueTypeText}: ${value} ت) مطمئن هستید؟`;
             }
             elements.deleteDialog.dataset.deleteType = type;
             elements.deleteDialog.dataset.deleteId = id;
             elements.deleteDialog.dataset.deleteElementSelector = `tr[data-id="${id}"]`;
             openDialog('deleteDialog');
         })
         .catch(error => {
             console.error(`Error fetching ${type} for delete prompt:`, error);
             showToast(`خطا: ${error.message || error}`, 'error');
         });
     }

     async function handleConfirmDelete() {
         const type = elements.deleteDialog.dataset.deleteType;
         const id = parseInt(elements.deleteDialog.dataset.deleteId);
         const elementSelector = elements.deleteDialog.dataset.deleteElementSelector;
         let elementToRemove = elementSelector ? $(elementSelector) : null;

         if (!type || (type !== 'student' && isNaN(id))) { // id check for non-student types
             console.error("Invalid delete data in dialog dataset");
             closeAllDialogs();
             return;
         }


         showLoading("در حال حذف...");
         if(elements.confirmDeleteBtn) elements.confirmDeleteBtn.disabled = true;
         if(elements.cancelDeleteBtn) elements.cancelDeleteBtn.disabled = true;

         const deleteAction = async () => {
             try {
                 if (type === 'student') {
                     await deleteStudentAndData(id); 
                     showToast("دانش آموز و تمام اطلاعات مرتبط حذف شد.", "success");
                     await loadAndRenderStudents(); 
                     if (currentViewStudentId === id) {
                         handleBack();
                     }
                 } else if (type === 'class') {
                     await deleteClass(id);
                     showToast("کلاس با موفقیت حذف شد.", "success");
                     await loadAndRenderClasses();
                     await loadAndRenderReport();
                 } else if (type === 'payment') {
                     await deletePayment(id);
                     showToast("پرداخت با موفقیت حذف شد.", "success");
                     await loadAndRenderPayments();
                     await loadAndRenderReport();
                 }
                 if (type === 'class' || type === 'payment') {
                      await displayLastActivityDate(currentViewStudentId); 
                 }
                if (type !== 'student') { // For class/payment, after their specific refresh, refresh student list for status
                    await loadAndRenderStudents();
                }

                 closeAllDialogs(); 
             } catch (error) {
                 console.error(`Error deleting ${type}:`, error);
                 showToast(`خطا در حذف: ${error.message || error}`, "error");
                 closeAllDialogs();
             } finally {
                 hideLoading();
                 if(elements.confirmDeleteBtn) elements.confirmDeleteBtn.disabled = false;
                 if(elements.cancelDeleteBtn) elements.cancelDeleteBtn.disabled = false;
             }
         };

         if (elementToRemove) {
             elementToRemove.classList.add('item-removing');
             elementToRemove.addEventListener('animationend', deleteAction, { once: true });
         } else {
             await deleteAction(); 
         }
     }

    // --- Bulk Delete ---
    function handleTableHeaderCheckboxChange(event) {
        const checkbox = event.target;
        const tableBody = checkbox.closest('table').querySelector('tbody');
        if (!tableBody) return; // Add check for tableBody
        const rowCheckboxes = tableBody.querySelectorAll('.row-select');
        const isChecked = checkbox.checked;
        const idSet = checkbox.id === 'selectAllClasses' ? selectedClassIds : selectedPaymentIds;

        rowCheckboxes.forEach(cb => {
            cb.checked = isChecked;
            const id = parseInt(cb.dataset.id);
            if (isChecked) {
                idSet.add(id);
            } else {
                idSet.delete(id);
            }
        });
        updateBulkDeleteButtonState();
    }

     function handleTableRowCheckboxChange(event) {
         const checkbox = event.target;
         const id = parseInt(checkbox.dataset.id);
         const table = checkbox.closest('table');
         if(!table) return; // Add null check
         const tableId = table.id;
         const idSet = tableId === 'classTable' ? selectedClassIds : selectedPaymentIds;
         const headerCheckbox = tableId === 'classTable' ? elements.selectAllClasses : elements.selectAllPayments;

         if (checkbox.checked) {
             idSet.add(id);
         } else {
             idSet.delete(id);
         }

         if (headerCheckbox) { // Add null check for headerCheckbox
            const allRowCheckboxes = checkbox.closest('tbody').querySelectorAll('.row-select');
            headerCheckbox.checked = allRowCheckboxes.length > 0 && idSet.size === allRowCheckboxes.length;
            headerCheckbox.indeterminate = idSet.size > 0 && idSet.size < allRowCheckboxes.length;
         }
         updateBulkDeleteButtonState();
     }

     function promptBulkDelete(type) {
         const idSet = type === 'class' ? selectedClassIds : selectedPaymentIds;
         const count = idSet.size;
         if (count === 0) return;

         const typeText = type === 'class' ? 'کلاس' : 'پرداخت';
          if (elements.deleteDialogMessage) {
              elements.deleteDialogMessage.innerHTML = `آیا از حذف <strong>${toPersianDigits(count)}</strong> ${typeText} انتخاب شده مطمئن هستید؟ <br><strong>این عمل قابل بازگشت نیست!</strong>`;
          }
          elements.deleteDialog.dataset.deleteType = `bulk-${type}`;
          elements.deleteDialog.dataset.deleteId = '';
          elements.deleteDialog.dataset.deleteElementSelector = '';
          openDialog('deleteDialog');
     }

      async function handleConfirmBulkDelete(type) {
         const idSet = type === 'class' ? selectedClassIds : selectedPaymentIds;
         const count = idSet.size;
         if (count === 0) {
             closeAllDialogs();
             return;
         }
         const typeText = type === 'class' ? 'کلاس' : 'پرداخت';

         showLoading(`در حال حذف ${toPersianDigits(count)} ${typeText}...`);
         if(elements.confirmDeleteBtn) elements.confirmDeleteBtn.disabled = true;
         if(elements.cancelDeleteBtn) elements.cancelDeleteBtn.disabled = true;

         try {
             if (type === 'class') {
                 await deleteClasses(idSet);
             } else {
                 await deletePayments(idSet);
             }
             showToast(`${toPersianDigits(count)} ${typeText} با موفقیت حذف شد.`, "success");
             idSet.clear(); 
             updateBulkDeleteButtonState();
             closeAllDialogs();
             if (type === 'class') await loadAndRenderClasses();
             else await loadAndRenderPayments();
             await loadAndRenderReport();
             await displayLastActivityDate(currentViewStudentId); 
             await loadAndRenderStudents(); // Refresh student list for status update

         } catch (error) {
              console.error(`Error bulk deleting ${type}:`, error);
              showToast(`خطا در حذف دسته‌جمعی: ${error.message || error}`, "error");
              closeAllDialogs();
         } finally {
             hideLoading();
              if(elements.confirmDeleteBtn) elements.confirmDeleteBtn.disabled = false;
             if(elements.cancelDeleteBtn) elements.cancelDeleteBtn.disabled = false;
         }
     }

    // --- Duplicate Entry ---
    function handleDuplicateEntry(event) {
         const button = event.target.closest('.btn-duplicate');
         if (!button) return;
         const row = button.closest('tr');
         if(!row) return; // Add null check
         const id = parseInt(row.dataset.id);
         const action = button.dataset.action; 
         const type = action.split('-')[1];
         const storeName = type === 'class' ? STORE_CLASSES : STORE_PAYMENTS;
         const formId = type === 'class' ? 'addClassForm' : 'addPaymentForm';
         const form = $(`#${formId}`);
         if(!form) return; // Add null check

         const dateInput = form.querySelector(`#${type}Date`);
         const dayInput = form.querySelector(`#${type}Day`);
         const costOrAmountInput = type === 'class' ? elements.classCost : elements.paymentAmount;
         const notesInput = type === 'class' ? elements.classNotes : elements.paymentNotes;

         if (!dateInput || !dayInput || !costOrAmountInput || !notesInput) {
            console.error("One or more form elements for duplication not found.");
            showToast("خطا: عناصر فرم برای کپی یافت نشد.", "error");
            return;
         }


         performDBAction(storeName, 'readonly', (store, resolve) => store.get(id).onsuccess = e => resolve(e.target.result))
         .then(entry => {
              if (!entry) throw new Error("رکورد اصلی برای کپی یافت نشد.");
              dateInput.value = entry.date;
              dayInput.value = entry.day; // Assuming day is stored and relevant
              costOrAmountInput.value = type === 'class' ? entry.cost : entry.amount;
              notesInput.value = entry.notes || '';
              handleAutoDaySelect({ target: dateInput }); 

              showToast(`اطلاعات ${type === 'class' ? 'کلاس' : 'پرداخت'} در فرم کپی شد. تاریخ را بررسی و ثبت کنید.`, 'info', 5000);
              form.scrollIntoView({ behavior: 'smooth', block: 'start' });
              dateInput.focus(); 
         })
         .catch(error => {
             console.error(`Error duplicating ${type}:`, error);
             showToast(`خطا در کپی کردن رکورد: ${error.message || error}`, 'error');
         });
     }

    // --- Sorting ---
    function handleTableSort(event) {
        const header = event.target.closest('th.sortable');
        if (!header) return;

        const table = header.closest('table');
        if(!table) return; // Add null check
        const type = table.id === 'classTable' ? 'class' : 'payment'; 
        const column = header.dataset.sort;
        const currentSortState = currentSort[type];

        let direction = 'asc';
        if (currentSortState.column === column) {
            direction = currentSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
             direction = (column === 'date' || column === 'cost' || column === 'amount') ? 'desc' : 'asc';
        }

        currentSort[type] = { column, direction };

        const data = type === 'class' ? currentClassList : currentPaymentList;
        const tbody = type === 'class' ? elements.classList : elements.paymentList;
        const empty = type === 'class' ? elements.classListEmpty : elements.paymentListEmpty;
        if(tbody && empty) { // Add null check
            renderTable(tbody, empty, data, type, column, direction);
        }
    }

    // --- Filtering ---
    function applyFilter(type) {
        const startInput = $(`#${type}FilterStartDate`);
        const endInput = $(`#${type}FilterEndDate`);
        const startDate = startInput?.value || null;
        const endDate = endInput?.value || null;

        if (type === 'class') {
            loadAndRenderClasses(startDate, endDate);
        } else if (type === 'payment') {
            loadAndRenderPayments(startDate, endDate);
        } else if (type === 'report') {
             loadAndRenderReport(startDate, endDate);
        }
    }

    function clearFilter(type) {
        const startInput = $(`#${type}FilterStartDate`);
        const endInput = $(`#${type}FilterEndDate`);
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';

        if (type === 'class') {
            loadAndRenderClasses();
        } else if (type === 'payment') {
            loadAndRenderPayments();
        } else if (type === 'report') { // For report, clearing filter usually means show all (no date restriction)
            loadAndRenderReport();
        }
    }


    // --- Export/Import ---
     async function handleExportData() {
         showLoading("در حال آماده سازی فایل پشتیبان...");
         try {
             const db = await initDB();
             const storesToExport = [STORE_STUDENTS, STORE_CLASSES, STORE_PAYMENTS];
             const exportData = {};

             const tx = db.transaction(storesToExport, 'readonly');
             let promises = [];

             for (const storeName of storesToExport) {
                 promises.push(new Promise((resolve, reject) => {
                     const store = tx.objectStore(storeName);
                     const request = store.getAll();
                     request.onsuccess = (event) => {
                         exportData[storeName] = event.target.result;
                         resolve();
                     };
                     request.onerror = (event) => reject(event.target.error);
                 }));
             }

             await Promise.all(promises); 

             exportData.metadata = {
                 exportDate: new Date().toISOString(),
                 appName: 'PrivateClassManager',
                 version: '2.0.1', 
                 dbVersion: DB_VERSION
             };

             const jsonData = JSON.stringify(exportData, null, 2); 
             const blob = new Blob([jsonData], { type: "application/json;charset=utf-8" });
             const filename = `ClassManagerBackup_${formatDateForFilename()}.json`;

             saveAs(blob, filename);

             recordBackupTimestamp(); 
             showToast("فایل پشتیبان با موفقیت ایجاد و دانلود شد.", "success");

         } catch (error) {
             console.error("Error exporting data:", error);
             showToast(`خطا در ایجاد فایل پشتیبان: ${error.message || error}`, "error");
         } finally {
             hideLoading();
         }
     }

     function handleImportFileSelect(event) {
         const file = event.target.files[0];
         if (!file) return;

         showLoading("در حال خواندن فایل...");
         const reader = new FileReader();

         reader.onload = (e) => {
             try {
                 const importedData = JSON.parse(e.target.result);

                 if (!importedData || typeof importedData !== 'object' || !importedData.metadata || !importedData[STORE_STUDENTS] || !importedData[STORE_CLASSES] || !importedData[STORE_PAYMENTS]) {
                     throw new Error("فرمت فایل پشتیبان نامعتبر است یا داده‌های لازم را ندارد.");
                 }

                 const summary = `
                     <p>اطلاعات فایل پشتیبان (${importedData.metadata.appName || '؟'} نسخه ${importedData.metadata.version || '؟'}):</p>
                     <ul>
                         <li>${toPersianDigits(importedData[STORE_STUDENTS].length)} دانش آموز/گروه</li>
                         <li>${toPersianDigits(importedData[STORE_CLASSES].length)} رکورد کلاس</li>
                         <li>${toPersianDigits(importedData[STORE_PAYMENTS].length)} رکورد پرداخت</li>
                     </ul>
                 `;
                 if(elements.importSummary) elements.importSummary.innerHTML = summary;
                 if(elements.importConfirmDialog) elements.importConfirmDialog.dataset.importData = JSON.stringify(importedData); 
                 openDialog('importConfirmDialog');

             } catch (error) {
                 console.error("Error parsing import file:", error);
                 showToast(`خطا در خواندن یا پردازش فایل: ${error.message || error}`, "error");
                 if(elements.importConfirmDialog) elements.importConfirmDialog.dataset.importData = ''; 
             } finally {
                 hideLoading();
                 event.target.value = null;
             }
         };

         reader.onerror = () => {
             showToast("خطا در خواندن فایل.", "error");
             hideLoading();
              event.target.value = null;
         };

         reader.readAsText(file);
     }

     async function handleConfirmImport() {
         const jsonData = elements.importConfirmDialog?.dataset.importData; // Added null check
         if (!jsonData) {
             showToast("داده‌ای برای وارد کردن یافت نشد.", "error");
             closeAllDialogs();
             return;
         }

         showLoading("در حال وارد کردن اطلاعات... این عملیات ممکن است کمی طول بکشد.");
         try {
             const importedData = JSON.parse(jsonData);
             const db = await initDB();
             const storesToClear = [STORE_STUDENTS, STORE_CLASSES, STORE_PAYMENTS];

             const clearTx = db.transaction(storesToClear, 'readwrite');
             let clearPromises = storesToClear.map(storeName => {
                 return new Promise((resolve, reject) => {
                     const request = clearTx.objectStore(storeName).clear();
                     request.onsuccess = resolve;
                     request.onerror = reject;
                 });
             });
             await Promise.all(clearPromises);
             console.log("Existing data cleared.");

             const importTx = db.transaction(storesToClear, 'readwrite');
             let importPromises = [];

             if (importedData[STORE_STUDENTS]) {
                 const studentStore = importTx.objectStore(STORE_STUDENTS);
                 importedData[STORE_STUDENTS].forEach(student => {
                      importPromises.push(new Promise((res) => { // Removed reject as not used
                          studentStore.put(student).onsuccess = res; 
                      }));
                 });
             }
             if (importedData[STORE_CLASSES]) {
                 const classStore = importTx.objectStore(STORE_CLASSES);
                 importedData[STORE_CLASSES].forEach(classItem => {
                      importPromises.push(new Promise((res) => { // Removed reject
                          classStore.put(classItem).onsuccess = res;
                      }));
                 });
             }
             if (importedData[STORE_PAYMENTS]) {
                 const paymentStore = importTx.objectStore(STORE_PAYMENTS);
                 importedData[STORE_PAYMENTS].forEach(paymentItem => {
                      importPromises.push(new Promise((res) => { // Removed reject
                          paymentStore.put(paymentItem).onsuccess = res;
                      }));
                 });
             }

             await Promise.all(importPromises);

             return new Promise((resolve, reject) => {
                importTx.oncomplete = () => resolve();
                importTx.onerror = (event) => reject(event.target.error);
             });

         } catch (error) {
             console.error("Error during import process:", error);
             showToast(`خطای جدی هنگام وارد کردن اطلاعات: ${error.message || error}. لطفاً صفحه را رفرش کنید.`, "error", 10000);
             throw error; 
         } finally {
             hideLoading();
             closeAllDialogs();
             if (elements.importConfirmDialog) elements.importConfirmDialog.dataset.importData = ''; 
         }
     }

     // --- Settings ---
     function openSettingsDialog() {
         if(elements.defaultClassCost) elements.defaultClassCost.value = currentAppSettings.defaultClassCost || '';
         openDialog('settingsDialog');
     }

     function handleSaveSettings() {
          if(elements.defaultClassCost) currentAppSettings.defaultClassCost = elements.defaultClassCost.value.trim();
          saveSettings();
          showToast("تنظیمات ذخیره شد.", "success");
          closeAllDialogs();
          if (currentViewStudentId && elements.classCost && !elements.classCost.value) {
                elements.classCost.value = currentAppSettings.defaultClassCost || '';
           }
     }

    // --- Data Loading Functions ---
    async function loadAndRenderStudents(searchTerm = '') {
        showLoading("در حال بارگذاری دانش آموزان...");
        try {
            let students = await getAllStudents();
            if (searchTerm) {
                const lowerSearchTerm = searchTerm.toLowerCase();
                students = students.filter(s => s.name.toLowerCase().includes(lowerSearchTerm));
            }
            await renderNameList(students); // Make sure renderNameList is awaited as it's now async
        } catch (error) {
            console.error("Error loading students:", error);
            showToast(`خطا در بارگذاری لیست دانش آموزان: ${error.message || error}`, 'error');
            if(elements.nameList && elements.nameListEmpty) renderNameList([]); // Show empty state on error
        } finally {
            hideLoading();
        }
    }

    async function loadAndRenderClasses(startDate = null, endDate = null) {
         if (!currentViewStudentId) return;
         try {
             currentClassList = await getClassesByStudent(currentViewStudentId, startDate, endDate);
             if(elements.classList && elements.classListEmpty) { // Add null check
                renderTable(elements.classList, elements.classListEmpty, currentClassList, 'class', currentSort.class.column, currentSort.class.direction);
             }
         } catch (error) {
              console.error("Error loading classes:", error);
             showToast(`خطا در بارگذاری لیست کلاس‌ها: ${error.message || error}`, 'error');
             if(elements.classList && elements.classListEmpty) { // Add null check
                renderTable(elements.classList, elements.classListEmpty, [], 'class', 'date', 'desc'); 
             }
         } finally {
         }
     }

     async function loadAndRenderPayments(startDate = null, endDate = null) {
          if (!currentViewStudentId) return;
         try {
             currentPaymentList = await getPaymentsByStudent(currentViewStudentId, startDate, endDate);
             if(elements.paymentList && elements.paymentListEmpty) { // Add null check
                renderTable(elements.paymentList, elements.paymentListEmpty, currentPaymentList, 'payment', currentSort.payment.column, currentSort.payment.direction);
             }
         } catch (error) {
              console.error("Error loading payments:", error);
             showToast(`خطا در بارگذاری لیست پرداخت‌ها: ${error.message || error}`, 'error');
             if(elements.paymentList && elements.paymentListEmpty) { // Add null check
                renderTable(elements.paymentList, elements.paymentListEmpty, [], 'payment', 'date', 'desc'); 
             }
         } finally {
         }
     }

     async function loadAndRenderReport(startDate = null, endDate = null) {
         if (!currentViewStudentId) return;
         await renderReportTable(currentViewStudentId, startDate, endDate);
     }

    // --- Initialization ---
    async function initializeApp() {
        console.log("Initializing App v2.0.1...");
        cacheElements();
        loadSettings(); 

        document.body.classList.remove('preload');
        setupEventListeners();

        try {
            await initDB(); 
            await loadAndRenderStudents(); 
            console.log("Application initialized successfully.");
        } catch (error) {
            console.error("FATAL: Could not initialize database:", error);
            showToast(`خطای بسیار جدی: امکان اتصال به پایگاه داده وجود ندارد. ${error}`, 'error', 15000);
        }
    }

    function setupEventListeners() {
        elements.themeToggleBtn?.addEventListener('click', toggleTheme);
        elements.exportDataBtn?.addEventListener('click', handleExportData);
        elements.importDataInput?.addEventListener('change', handleImportFileSelect);
        elements.settingsBtn?.addEventListener('click', openSettingsDialog);
        elements.addStudentForm?.addEventListener('submit', handleAddStudentSubmit);
        elements.searchInput?.addEventListener('input', handleSearchInput); 
        elements.nameList?.addEventListener('click', handleNameListActions);
        elements.backBtn?.addEventListener('click', handleBack);
        elements.page2?.querySelector('.tabs')?.addEventListener('click', handleTabSwitch);
        elements.addClassForm?.addEventListener('submit', handleAddClassFormSubmit);
        elements.classList?.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            const checkbox = e.target.closest('input[type="checkbox"].row-select');
            const duplicateBtn = e.target.closest('.btn-duplicate');

             if (button) {
                const row = button.closest('tr');
                if(!row) return;
                const id = parseInt(row.dataset.id);
                const action = button.dataset.action; 
                if (action === 'edit-class') promptEditEntry('class', id);
                else if (action === 'delete-class') promptDeleteEntry('class', id, row);
            } else if (checkbox) {
                handleTableRowCheckboxChange(e);
            } else if (duplicateBtn) {
                 handleDuplicateEntry(e);
            }
        });
        elements.selectAllClasses?.addEventListener('change', handleTableHeaderCheckboxChange);
        elements.bulkDeleteClassesBtn?.addEventListener('click', () => promptBulkDelete('class'));
        elements.applyClassFilterBtn?.addEventListener('click', () => applyFilter('class'));
        elements.clearClassFilterBtn?.addEventListener('click', () => clearFilter('class'));
        elements.classTable?.querySelector('thead')?.addEventListener('click', handleTableSort);
        elements.classDate?.addEventListener('input', handleAutoDaySelect);
        elements.addPaymentForm?.addEventListener('submit', handleAddPaymentFormSubmit);
        elements.paymentList?.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
             const checkbox = e.target.closest('input[type="checkbox"].row-select');
             const duplicateBtn = e.target.closest('.btn-duplicate');

             if (button) {
                const row = button.closest('tr');
                if(!row) return;
                const id = parseInt(row.dataset.id);
                const action = button.dataset.action; 
                 if (action === 'edit-payment') promptEditEntry('payment', id);
                else if (action === 'delete-payment') promptDeleteEntry('payment', id, row);
            } else if (checkbox) {
                 handleTableRowCheckboxChange(e);
            } else if (duplicateBtn) {
                  handleDuplicateEntry(e);
            }
        });
        elements.selectAllPayments?.addEventListener('change', handleTableHeaderCheckboxChange);
        elements.bulkDeletePaymentsBtn?.addEventListener('click', () => promptBulkDelete('payment'));
        elements.applyPaymentFilterBtn?.addEventListener('click', () => applyFilter('payment'));
        elements.clearPaymentFilterBtn?.addEventListener('click', () => clearFilter('payment'));
        elements.paymentTable?.querySelector('thead')?.addEventListener('click', handleTableSort);
        elements.paymentDate?.addEventListener('input', handleAutoDaySelect);
        elements.applyReportFilterBtn?.addEventListener('click', () => applyFilter('report'));
        elements.clearReportFilterBtn?.addEventListener('click', () => clearFilter('report'));
        elements.cancelDeleteBtn?.addEventListener('click', closeAllDialogs);
        elements.confirmDeleteBtn?.addEventListener('click', () => {
            const type = elements.deleteDialog?.dataset.deleteType; // Added null check
             if (type && type.startsWith('bulk-')) {
                 handleConfirmBulkDelete(type.split('-')[1]);
             } else if (type) { // Ensure type is defined before calling handleConfirmDelete
                 handleConfirmDelete();
             }
        });

        elements.editStudentForm?.addEventListener('submit', handleEditStudentSubmit);
        elements.cancelEditStudentBtn?.addEventListener('click', closeAllDialogs);
        elements.editEntryForm?.addEventListener('submit', handleEditEntrySubmit);
        elements.cancelEditEntryBtn?.addEventListener('click', closeAllDialogs);
        elements.editEntryDate?.addEventListener('input', handleAutoDaySelect); 
        elements.saveSettingsBtn?.addEventListener('click', handleSaveSettings);
        elements.cancelSettingsBtn?.addEventListener('click', closeAllDialogs);
        elements.closeErrorBtn?.addEventListener('click', closeAllDialogs);
        elements.confirmImportBtn?.addEventListener('click', () => {
            handleConfirmImport()
                .then(async () => {
                    showToast("اطلاعات با موفقیت وارد و جایگزین شد.", "success", 5000);
                    await loadAndRenderStudents();
                    if (currentViewStudentId && currentViewStudentName) { // ensure currentViewStudentName is also available
                        await showDetailsPage(currentViewStudentId, currentViewStudentName); 
                    } else {
                        showPage('page1'); 
                    }
                })
                .catch(err => { /* Error handled in handleConfirmImport */ });
        });
        elements.cancelImportBtn?.addEventListener('click', () => {
            if (elements.importConfirmDialog) elements.importConfirmDialog.dataset.importData = ''; 
            closeAllDialogs();
        });
        elements.overlay?.addEventListener('click', closeAllDialogs);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.querySelector('.dialog.active')) {
                closeAllDialogs();
            }
        });
        elements.toastCloseBtn?.addEventListener('click', closeToast);
    }

    // --- Start the application ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

})(); // End IIFE