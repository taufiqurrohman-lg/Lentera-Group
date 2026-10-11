// Ambil database terpisah dari LocalStorage
// --- AREA CLOUD FIREBASE BARU (MENGGANTIKAN LOCALSTORAGE LAMA) ---
const auth = window.firebaseAuth;
const db = window.firebaseDb;
const utils = window.firebaseAuthUtils;

let transactions = [];
let jobs = [];
let currentUserId = null;

// SISTEM PROTEKSI OTOMATIS: MENGUNCI LAYAR JIKA BELUM LOGIN & SINKRONISASI DATA HP-PC
if (auth) {
    utils.onAuthStateChanged(auth, function(user) {
        if (user) {
            currentUserId = user.uid;
            document.getElementById('app-dashboard').style.display = 'block';
            document.getElementById('auth-container').style.display = 'none';
            loadDataFromCloud(); // Otomatis ambil data terbaru dari server cloud Google
        } else {
            currentUserId = null;
            document.getElementById('app-dashboard').style.display = 'none';
            document.getElementById('auth-container').style.display = 'block';
        }
    });
}

// SISTEM AMBIL DATA AMAN DARI INTERNET REAL-TIME
async function loadDataFromCloud() {
    if (!currentUserId) return;
    try {
        const queryTrx = await utils.getDocs(utils.collection(db, "users", currentUserId, "transactions"));
        transactions = [];
        queryTrx.forEach(doc => { transactions.push({ firestoreId: doc.id, ...doc.data() }); });

        const queryJob = await utils.getDocs(utils.collection(db, "users", currentUserId, "jobs"));
        jobs = [];
        queryJob.forEach(doc => { jobs.push({ firestoreId: doc.id, ...doc.data() }); });

        updateKeuanganUI();
        updateJobUI();
    } catch (error) {
        console.error("Gagal sinkronisasi data cloud: ", error);
    }
}

let expenseChartInstance = null;

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
    // Sembunyikan semua tab content
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    // Hilangkan kelas active dari semua tombol tab
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    // Tampilkan tab yang dipilih
    document.getElementById(`tab-${tabName}`).classList.add('active');
    // Tambahkan kelas active ke tombol yang diklik
    element.classList.add('active');

    // Jika masuk ke tab keuangan, render ulang grafiknya agar pas di layar
    if(tabName === 'keuangan') {
        updateKeuanganUI();
    } else if (tabName === 'job') {
        updateJobUI();
    }
}

// --- HELPER FORMAT RUPIAH ACCOUNTING (INPUT & DISPLAY) ---
function initAccountingInput(inputElement) {
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
    let clean = string.replace(/[^0-9]/g, '');
    return clean ? parseFloat(clean) : 0;
}

// ================= LOGIKA MENU KEUANGAN =================

// --- PROSES HAPUS CATATAN KEUANGAN DARI SERVER CLOUD secara AMAN ---
async function deleteTransaction(firestoreId) {
    if (!confirm("Hapus catatan transaksi ini dari cloud database secara permanen?")) return;
    try {
        await utils.deleteDoc(utils.doc(db, "users", currentUserId, "transactions", firestoreId));
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
            <td class="text-center"><button class="btn-delete" onclick="deleteTransaction(${trx.id})">Hapus</button></td>
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

transactionForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const numericAmount = parseRupiahToNumber(amountInput.value);
    if (isNaN(numericAmount) || numericAmount <= 0) return;

           // --- PROSES KIRIM DATA TRANSAKSI BARU KE SERVER CLOUD GOOGLE ---
        const newTrxData = {
            id: Date.now(),
            description: descriptionInput.value,
            amount: numericAmount,
            type: typeInput.value
        };

        try {
            const docRef = await utils.addDoc(utils.collection(db, "users", currentUserId, "transactions"), newTrxData);
            transactions.push({ firestoreId: docRef.id, ...newTrxData });
            updateKeuanganUI();
        } catch (err) { 
            alert("Koneksi gagal! Gagal menyimpan data transaksi ke server cloud."); 
        }

    transactionForm.reset();
});

exportBtn.addEventListener('click', function() {
    if (transactions.length === 0) { alert('Tidak ada data.'); return; }
    let csvContent = "Tanggal;Deskripsi Transaksi;Jenis;Nominal\n";
    transactions.forEach(trx => {
        const date = new Date(trx.id).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        csvContent += `${date};${trx.description.replace(/;/g, ',')};${trx.type === 'income' ? 'Pemasukan' : 'Pengeluaran'};${trx.amount}\n`;
    });
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `Laporan_Keuangan_BizBalance_${new Date().toISOString().slice(0,10)}.csv`);
    link.click();
});


// ================= LOGIKA MENU JOB MASUK (JASA) =================

// --- LOGIKA UTAMA MONITOR JASA BERBASIS SERVER CLOUD GOOGLE ---

async function deleteJob(firestoreId) {
    if (!confirm("Hapus data order jasa ini secara permanen dari server cloud?")) return;
    try {
        await utils.deleteDoc(utils.doc(db, "users", currentUserId, "jobs", firestoreId));
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

        // Otomatisasi pembukuan kas pelunasan ke cloud saat diubah ke status 'Selesai'
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
                const docTrxRef = await utils.addDoc(utils.collection(db, "users", currentUserId, "transactions"), newTrxData);
                transactions.push({ firestoreId: docTrxRef.id, ...newTrxData });
                updateKeuanganUI();
            }
        }

        // Sinkronisasi status pengerjaan baru langsung ke internet server
        await utils.updateDoc(utils.doc(db, "users", currentUserId, "jobs", firestoreId), { status: newStatus });
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
        // ➕ HITUNG OTOMATIS OMZET DARI JOB YANG SELESAI
    let totalJobRevenue = 0;
    jobs.forEach(job => {
        if (job.status === 'done') {
            totalJobRevenue += job.price;
        }
    });
    if (totalJobRevenueDisplay) {
        totalJobRevenueDisplay.innerText = 'Rp ' + totalJobRevenue.toLocaleString('id-ID');
    }

    
    // Mengurutkan otomatis berdasarkan kronologi Tanggal, Bulan, dan Tahun Deadline
    const sortedJobs = [...jobs].sort((a, b) => {
        const dateA = new Date(a.deadline);
        const dateB = new Date(b.deadline);
        return dateA - dateB;
    });

    sortedJobs.forEach(job => {
        const row = document.createElement('tr');
        const formattedDeadline = new Date(job.deadline).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        
        let statusClass = 'status-pending';
        if(job.status === 'progress') statusClass = 'status-progress';
        if(job.status === 'done') statusClass = 'status-done';

                   // FIX KODE SEJAJAR & RATA TENGAH (CENTER)
               row.innerHTML = `
            <td style="text-align: center;"><strong>${formattedDeadline}</strong></td>
            <td style="text-align: center;">${job.client}</td>
            <td style="text-align: center; color: #718096; font-size: 13px;">${job.address || '-'}</td>
            <td style="text-align: center; font-weight: 500; color: #1e3c72;">${job.service}</td>
            <td class="text-right" style="font-weight: 600;">Rp ${job.price.toLocaleString('id-ID')}</td>
            <!-- ➕ SISIPAN KOLOM DATA DP BARU RATA KANAN DENGAN JARAK AMAN -->
            <td class="text-right" style="font-weight: 600; padding-right: 15px; color: #3b82f6;">Rp ${(job.dp || 0).toLocaleString('id-ID')}</td>
            <td class="text-center">
                <select class="status-select ${statusClass}" onchange="changeJobStatus(${job.id}, this.value)">
                    <option value="pending" ${job.status === 'pending' ? 'selected' : ''}>⏳ Pending</option>
                    <option value="progress" ${job.status === 'progress' ? 'selected' : ''}>🔵 Diproses</option>
                    <option value="done" ${job.status === 'done' ? 'selected' : ''}>✅ Selesai</option>
                </select>
            </td>
            <td class="text-center">
                <button class="btn-delete" onclick="deleteJob(${job.id})">Hapus</button>
            </td>
        `;

        jobTableBody.appendChild(row);
    });
}

jobForm.addEventListener('submit', async function(e) {

    e.preventDefault();
           const numericPrice = parseRupiahToNumber(jobPriceInput.value);
        if (isNaN(numericPrice) || numericPrice <= 0) return;
        
        const numericDP = parseRupiahToNumber(jobDPInput.value) || 0; // Baca nominal DP, default 0 jika kosong

        // Memasukkan data baru secara lengkap ke daftar Job Jasa
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
            // Tulis data order jasa baru langsung ke Google Cloud Database Server
            const docJobRef = await utils.addDoc(utils.collection(db, "users", currentUserId, "jobs"), newJobData);
            jobs.push({ firestoreId: docJobRef.id, ...newJobData });

            // Otomatisasi pembukuan uang muka ke keuangan cloud secara aman
            if (numericDP > 0) {
                const newTrxData = {
                    id: Date.now() + 1,
                    description: `[DP Jasa] ${jobServiceInput.value} - ${clientNameInput.value}`,
                    amount: numericDP,
                    type: 'income'
                };
                const docTrxRef = await utils.addDoc(utils.collection(db, "users", currentUserId, "transactions"), newTrxData);
                transactions.push({ firestoreId: docTrxRef.id, ...newTrxData });
            }

            loadDataFromCloud(); // Refresh otomatis agar HP & PC sinkron seketika
            jobForm.reset();
        } catch (err) { 
            alert("Gagal mendaftarkan data order jasa baru ke server cloud."); 
        }


});

// ➕ FUNGSIONALITAS EKSPOR EXCEL/CSV UNTUK DATA ORDER JASA
if (exportJobBtn) {
    exportJobBtn.addEventListener('click', function() {
        if (jobs.length === 0) { alert('Tidak ada data order jasa yang bisa diekspor.'); return; }
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
