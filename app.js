// ============================================================================
// LENTERA GROUP - MULTI-FITUR PRO (APP.JS FULL CLEAN CODE)
// ============================================================================

const firebaseAuthInstance = window.firebaseAuth;
const firebaseDbInstance = window.firebaseDb;
const utils = window.firebaseAuthUtils;

let transactions = [];
let jobs = [];
let currentUserId = null;
let expenseChartInstance = null;

// SISTEM PROTEKSI OTOMATIS: MENGUNCI LAYAR JIKA BELUM LOGIN & SINKRONISASI DATA HP-PC
if (firebaseAuthInstance) {
    utils.onAuthStateChanged(firebaseAuthInstance, function(user) {
        const appDashboard = document.getElementById('app-dashboard');
        const authContainer = document.getElementById('auth-container');
        
        if (user) {
            currentUserId = user.uid;
            if (appDashboard) appDashboard.style.display = 'block';
            if (authContainer) authContainer.style.display = 'none';
            loadDataFromCloud(); 
        } else {
            currentUserId = null;
            if (appDashboard) appDashboard.style.display = 'none';
            if (authContainer) authContainer.style.display = 'block';
        }
    });
}

// SISTEM AMBIL DATA AMAN DARI INTERNET REAL-TIME
async function loadDataFromCloud() {
    if (!currentUserId) return;
    try {
        const queryTrx = await utils.getDocs(utils.collection(firebaseDbInstance, "users", currentUserId, "transactions"));
        transactions = [];
        queryTrx.forEach(doc => { transactions.push({ firestoreId: doc.id, ...doc.data() }); });
        
        const queryJob = await utils.getDocs(utils.collection(firebaseDbInstance, "users", currentUserId, "jobs"));
        jobs = [];
        queryJob.forEach(doc => { jobs.push({ firestoreId: doc.id, ...doc.data() }); });
        
        updateKeuanganUI();
        updateJobUI();
    } catch (error) {
        console.error("Gagal sinkronisasi data cloud: ", error);
    }
}

// DOM Elemen Keuangan
const transactionForm = document.getElementById('transactionForm');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const typeInput = document.getElementById('type');
const balanceDisplay = document.getElementById('balanceDisplay');
const totalIncomeDisplay = document.getElementById('totalIncomeDisplay');
const totalExpenseDisplay = document.getElementById('totalExpenseDisplay');
const historyTableBody = document.getElementById('historyTableBody');
const exportBtn = document.getElementById('exportBtn');

// DOM Elemen Job
const jobForm = document.getElementById('jobForm');
const clientNameInput = document.getElementById('clientName');
const jobServiceInput = document.getElementById('jobService');
const jobPriceInput = document.getElementById('jobPrice');
const jobDPInput = document.getElementById('jobDP');
const jobDeadlineInput = document.getElementById('jobDeadline');
const clientAddressInput = document.getElementById('clientAddress');
const jobTableBody = document.getElementById('jobTableBody');
const totalJobRevenueDisplay = document.getElementById('totalJobRevenueDisplay');
const exportJobBtn = document.getElementById('exportJobBtn');

// --- FIX SISTEM TOGGLE TAB NAVIGATION MENU ---
function switchTab(tabName, element) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');
    if (element) element.classList.add('active');
    
    if(tabName === 'keuangan') {
        updateKeuanganUI();
    } else if (tabName === 'job') {
        updateJobUI();
    }
}
window.switchTab = switchTab;

// --- HELPER FORMAT RUPIAH ACCOUNTING (INPUT & DISPLAY) ---
function initAccountingInput(inputElement) {
    if (!inputElement) return;
    inputElement.addEventListener('input', function() {
        let numberString = this.value.replace(/[^0-9]/g, '');
        if (numberString === "") { this.value = ""; return; }
        this.value = 'Rp ' + Number(numberString).toLocaleString('id-ID');
    });
}
initAccountingInput(amountInput);
initAccountingInput(jobPriceInput);
initAccountingInput(jobDPInput);

function parseRupiahToNumber(string) {
    if (!string) return 0;
    let clean = string.replace(/[^0-9]/g, '');
    return clean ? parseFloat(clean) : 0;
}

// ================= LOGIKA MENU KEUANGAN =================
async function deleteTransaction(firestoreId) {
    if (!confirm("Hapus catatan transaksi ini dari cloud database secara permanen?")) return;
    try {
        await utils.deleteDoc(utils.doc(firebaseDbInstance, "users", currentUserId, "transactions", firestoreId));
        transactions = transactions.filter(trx => trx.firestoreId !== firestoreId);
        updateKeuanganUI();
    } catch (e) { 
        alert("Gagal menghapus data transaksi di server cloud."); 
    }
}
window.deleteTransaction = deleteTransaction;

function updateChart() {
    const canvas = document.getElementById('expenseChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const expenses = transactions.filter(trx => trx.type === 'expense');
    const categoryTotals = {};
    
    expenses.forEach(trx => {
        const cat = trx.description.trim();
        const formattedCat = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
        categoryTotals[formattedCat] = (categoryTotals[formattedCat] || 0) + trx.amount;
    });
    
    const labels = Object.keys(categoryTotals);
    const dataValues = Object.values(categoryTotals);
    
    if (expenseChartInstance) { expenseChartInstance.destroy(); }
    if (labels.length === 0) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    
    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: ['#1e3c72', '#2a5298', '#4a90e2', '#00d2ff', '#718096', '#a0aec0', '#2d3748'],
                borderWidth: 2, borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }
        }
    });
}

function updateKeuanganUI() {
    if (!historyTableBody) return;
    historyTableBody.innerHTML = '';
    let totalBalance = 0, totalIncome = 0, totalExpense = 0;
    
    const sortedTransactions = [...transactions].sort((a, b) => b.id - a.id);
    sortedTransactions.forEach(trx => {
        const row = document.createElement('tr');
        const trxDate = new Date(trx.id).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const isIncome = trx.type === 'income';
        const typeBadge = isIncome ? '<span class="badge-type badge-income">Masuk</span>' : '<span class="badge-type badge-expense">Keluar</span>';
        
        row.innerHTML = `
            <td>${trxDate}</td>
            <td style="font-weight: 500;">${trx.description}</td>
            <td>${typeBadge}</td>
            <td class="text-right ${isIncome ? 'text-income' : 'text-expense'}">${isIncome ? '+' : '-'} Rp ${trx.amount.toLocaleString('id-ID')}</td>
            <td class="text-center"><button class="btn-delete" onclick="deleteTransaction('${trx.firestoreId}')">Hapus</button></td>
        `;
        historyTableBody.appendChild(row);
        
        if (isIncome) { totalBalance += trx.amount; totalIncome += trx.amount; }
        else { totalBalance -= trx.amount; totalExpense += trx.amount; }
    });
    
    if(balanceDisplay) balanceDisplay.innerText = totalBalance < 0 ? '- Rp ' + Math.abs(totalBalance).toLocaleString('id-ID') : 'Rp ' + totalBalance.toLocaleString('id-ID');
    if(totalIncomeDisplay) totalIncomeDisplay.innerText = 'Rp ' + totalIncome.toLocaleString('id-ID');
    if(totalExpenseDisplay) totalExpenseDisplay.innerText = 'Rp ' + totalExpense.toLocaleString('id-ID');
    updateChart();
}

if (transactionForm) {
    transactionForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const numericAmount = parseRupiahToNumber(amountInput.value);
        if (isNaN(numericAmount) || numericAmount <= 0) return;
        
        const newTrxData = {
            id: Date.now(),
            description: descriptionInput.value,
            amount: numericAmount,
            type: typeInput.value
        };
        
        try {
            const collectionRef = utils.collection(firebaseDbInstance, "users", currentUserId, "transactions");
            const docRef = await collectionRef.add(newTrxData);
            transactions.push({ firestoreId: docRef.id, ...newTrxData });
            updateKeuanganUI();
            transactionForm.reset();
        } catch (err) { 
            alert("Koneksi gagal! Gagal menyimpan data transaksi ke server cloud."); 
        }
    });
}

// ================= LOGIKA UTAMA MONITOR JASA CLOUD =================
async function deleteJob(firestoreId) {
    if (!confirm("Hapus data order jasa ini secara permanen dari server cloud?")) return;
    try {
        await utils.deleteDoc(utils.doc(firebaseDbInstance, "users", currentUserId, "jobs", firestoreId));
        jobs = jobs.filter(job => job.firestoreId !== firestoreId);
        updateJobUI();
    } catch (e) { 
        alert("Gagal menghapus data jasa di server cloud."); 
    }
}
window.deleteJob = deleteJob;

async function changeJobStatus(firestoreId, newStatus) {
    try {
        const targetJob = jobs.find(j => j.firestoreId === firestoreId);
        if (!targetJob) return;
        
        if (newStatus === 'done' && targetJob.status !== 'done') {
            const sisaPelunasan = targetJob.price - (targetJob.dp || 0);
            const sudahAda = transactions.some(trx => trx.description.includes(`[Pelunasan Jasa]`) && trx.amount === sisaPelunasan);
            
            if (!sudahAda && sisaPelunasan > 0) {
                const newTrxData = {
                    id: Date.now(),
                    description: `[Pelunasan Jasa] ${targetJob.service} - ${targetJob.client}`,
                    amount: sisaPelunasan,
                    type: 'income'
                };
                const trxCollectionRef = utils.collection(firebaseDbInstance, "users", currentUserId, "transactions");
                const docTrxRef = await trxCollectionRef.add(newTrxData);
                transactions.push({ firestoreId: docTrxRef.id, ...newTrxData });
                updateKeuanganUI();
            }
        }
        
        const jobDocRef = utils.doc(firebaseDbInstance, "users", currentUserId, "jobs", firestoreId);
        await utils.updateDoc(jobDocRef, { status: newStatus });
        jobs = jobs.map(j => { if (j.firestoreId === firestoreId) j.status = newStatus; return j; });
        updateJobUI();
    } catch (e) { 
        alert("Gagal mengubah status di server cloud."); 
    }
}
window.changeJobStatus = changeJobStatus;

function updateJobUI() {
    if (!jobTableBody) return;
    jobTableBody.innerHTML = '';
    
    let totalJobRevenue = 0;
    jobs.forEach(job => { if (job.status === 'done') totalJobRevenue += job.price; });
    if (totalJobRevenueDisplay) totalJobRevenueDisplay.innerText = 'Rp ' + totalJobRevenue.toLocaleString('id-ID');
    
    const sortedJobs = [...jobs].sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    sortedJobs.forEach(job => {
        const row = document.createElement('tr');
        const formattedDeadline = new Date(job.deadline).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        let statusClass = job.status === 'progress' ? 'status-progress' : (job.status === 'done' ? 'status-done' : 'status-pending');
        
        row.innerHTML = `
            <td style="text-align: center;"><strong>${formattedDeadline}</strong></td>
            <td style="text-align: center;">${job.client}</td>
            <td style="text-align: center; color: #718096; font-size: 13px;">${job.address || '-'}</td>
            <td style="text-align: center; font-weight: 500; color: #1e3c72;">${job.service}</td>
            <td class="text-right" style="font-weight: 600;">Rp ${job.price.toLocaleString('id-ID')}</td>
            <td class="text-right" style="font-weight: 600; padding-right: 15px; color: #3b82f6;">Rp ${(job.dp || 0).toLocaleString('id-ID')}</td>
            <td class="text-center">
                <select class="status-select ${statusClass}" onchange="changeJobStatus('${job.firestoreId}', this.value)">
                    <option value="pending" ${job.status === 'pending' ? 'selected' : ''}>⏳ Pending</option>
                    <option value="progress" ${job.status === 'progress' ? 'selected' : ''}>🔵 Diproses</option>
                    <option value="done" ${job.status === 'done' ? 'selected' : ''}>✅ Selesai</option>
                </select>
            </td>
            <td class="text-center"><button class="btn-delete" onclick="deleteJob('${job.firestoreId}')">Hapus</button></td>
        `;
        jobTableBody.appendChild(row);
    });
}

if (jobForm) {
    jobForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const numericPrice = parseRupiahToNumber(jobPriceInput.value);
        if (isNaN(numericPrice) || numericPrice <= 0) return;
        const numericDP = parseRupiahToNumber(jobDPInput.value) || 0;
        
        const newJobData = {
            id: Date.now(),
            client: clientNameInput.value,
            service: jobServiceInput.value,
            address: clientAddressInput.value,
            price: numericPrice,
            dp: numericDP,
            deadline: jobDeadlineInput.value,
            status: 'pending'
        };
        
        try {
            const collectionRef = utils.collection(firebaseDbInstance, "users", currentUserId, "jobs");
            const docJobRef = await collectionRef.add(newJobData);
            jobs.push({ firestoreId: docJobRef.id, ...newJobData });
            
            if (numericDP > 0) {
                const newTrxData = {
                    id: Date.now() + 1,
                    description: `[DP Jasa] ${jobServiceInput.value} - ${clientNameInput.value}`,
                    amount: numericDP,
                    type: 'income'
                };
                const trxCollectionRef = utils.collection(firebaseDbInstance, "users", currentUserId, "transactions");
                const docTrxRef = await trxCollectionRef.add(newTrxData);
                transactions.push({ firestoreId: docTrxRef.id, ...newTrxData });
            }
            loadDataFromCloud(); 
            jobForm.reset();
        } catch (err) { 
            alert("Gagal mendaftarkan data order jasa baru ke server cloud."); 
        }
    });
}

// ================= INTERKONEKSI TOMBOL EKSPOR DATA CSV =================
if (exportBtn) {
    exportBtn.addEventListener('click', function() {
        if (transactions.length === 0) { alert('Tidak ada data transaksi.'); return; }
        let csvContent = "Tanggal;Deskripsi Transaksi;Jenis;Nominal\n";
        transactions.forEach(trx => {
            const date = new Date(trx.id).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
            csvContent += `${date};${trx.description.replace(/;/g, ',')};${trx.type === 'income' ? 'Pemasukan' : 'Pengeluaran'};${trx.amount}\n`;
        });
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(blob));
        link.setAttribute("download", `Laporan_Keuangan_${new Date().toISOString().slice(0,10)}.csv`);
        link.click();
    });
}

if (exportJobBtn) {
    exportJobBtn.addEventListener('click', function() {
        if (jobs.length === 0) { alert('Tidak ada data order jasa.'); return; }
        let csvContent = "Deadline;Nama Pelanggan;Alamat;Layanan Jasa;Nilai Kontrak;Status\n";
        jobs.forEach(job => {
            const date = new Date(job.deadline).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
            let statusText = 'Pending';
            if (job.status === 'progress') statusText = 'Diproses';
            if (job.status === 'done') statusText = 'Selesai';
            
            csvContent += `${date};${job.client.replace(/;/g, ',')};${(job.address || '-').replace(/;/g, ',')};${job.service.replace(/;/g, ',')};${job.price};${statusText}\n`;
        });
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(blob));
        link.setAttribute("download", `Laporan_Order_Jasa_${new Date().toISOString().slice(0,10)}.csv`);
        link.click();
    });
}

// ================= 🔐 SISTEM KEAMANAN & PENGENDALI PANEL AKSES AKUN (FIXED & CLEAN) =================
document.addEventListener("DOMContentLoaded", function() {
    let isLoginMode = true;
    
    const authForm = document.getElementById('authForm');
    const authEmail = document.getElementById('authEmail');
    const authPassword = document.getElementById('authPassword');
    const authTitle = document.getElementById('auth-title');
    const btnAuthAction = document.getElementById('btnAuthAction');
    const toggleAuthLink = document.getElementById('toggleAuthLink');
    const toggleAuthText = document.getElementById('toggleAuthText');
    const btnLogout = document.getElementById('btnLogout');
    const authContainer = document.getElementById('auth-container');
    const appDashboard = document.getElementById('app-dashboard');

    if (toggleAuthLink) {
        toggleAuthLink.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            isLoginMode = !isLoginMode;
            
            if (!isLoginMode) {
                if (authTitle) authTitle.innerText = "📝 Registrasi Akun Baru Bisnis";
                if (btnAuthAction) btnAuthAction.innerText = "Buat Akun Bisnis Aman";
                if (toggleAuthText) toggleAuthText.innerText = "Sudah memiliki akun pengelola?";
                if (toggleAuthLink) toggleAuthLink.innerText = "Masuk Di Sini";
            } else {
                if (authTitle) authTitle.innerText = "🔐 Login Pemilik Bisnis";
                if (btnAuthAction) btnAuthAction.innerText = "Masuk Ke Dasbor";
                if (toggleAuthText) toggleAuthText.innerText = "Belum punya akun pengelola?";
                if (toggleAuthLink) toggleAuthLink.innerText = "Daftar Akun";
            }
        });
    }

   if (authForm) {
        authForm.addEventListener('submit', function(e) {
            e.preventDefault();
            // Membersihkan spasi tak terlihat di email dan mengubah ke huruf kecil
            const email = authEmail.value.trim().toLowerCase();
            const password = authPassword.value;
            
            if (password.length < 6) {
                alert("Sistem Keamanan Google Mewajibkan Password Minimal 6 Karakter!");
                return;
            }

            if (!isLoginMode) {
                // Proses Pendaftaran Akun Baru
                firebaseAuthInstance.createUserWithEmailAndPassword(email, password)
                    .then(() => { 
                        alert("Akun Bisnis Berhasil Dibuat dan Dilindungi Sistem Cloud!"); 
                        authForm.reset(); 
                        if (toggleAuthLink) toggleAuthLink.click(); 
                    })
                    .catch(err => {
                        alert("Gagal Mendaftar: " + err.message);
                    });
            } else {
                // Proses Login ke Dasbor dengan Penanganan Error Spesifik
                firebaseAuthInstance.signInWithEmailAndPassword(email, password)
                    .then((userCredential) => {
                        alert("Akses Diterima! Selamat datang di Dasbor Lentera Group.");
                        currentUserId = userCredential.user.uid;
                        if (authContainer) authContainer.style.display = 'none';
                        if (appDashboard) appDashboard.style.display = 'block';
                        loadDataFromCloud();
                    })
                    .catch(err => {
                        // Menampilkan informasi error yang jelas di konsol dan layar
                        console.error("Firebase Auth Error Code:", err.code);
                        console.error("Firebase Auth Error Message:", err.message);
                        
                        if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                            alert("Password Salah! Periksa kembali huruf besar/kecil pada password Anda.");
                        } else if (err.code === 'auth/user-not-found') {
                            alert("Email belum terdaftar! Silakan klik 'Daftar Akun' terlebih dahulu.");
                        } else if (err.code === 'auth/invalid-email') {
                            alert("Format penulisan email tidak valid.");
                        } else {
                            alert("Akses Ditolak: " + err.message);
                        }
                    });
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', function() {
            firebaseAuthInstance.signOut().then(() => { alert("Sesi Ditutup. Anda Keluar dengan Aman!"); });
        });
    }
});