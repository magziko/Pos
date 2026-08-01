// ============================================================
// POS Screen Logic
// ============================================================

let currentSession = null;
let currentProfile = null;

let allProducts = [];   // من قاعدة البيانات
let allCategories = [];
let activeCategory = 'all';

let cart = [];           // [{ product, quantity, unitPrice }]
let heldOrders = JSON.parse(localStorage.getItem('pos_held_orders') || '[]');

const els = {
  branchLabel: document.getElementById('branchLabel'),
  cashierLabel: document.getElementById('cashierLabel'),
  clockLabel: document.getElementById('clockLabel'),
  logoutBtn: document.getElementById('logoutBtn'),
  searchInput: document.getElementById('searchInput'),
  categoriesRow: document.getElementById('categoriesRow'),
  productGrid: document.getElementById('productGrid'),
  customerSelect: document.getElementById('customerSelect'),
  cartItems: document.getElementById('cartItems'),
  subtotalLabel: document.getElementById('subtotalLabel'),
  totalLabel: document.getElementById('totalLabel'),
  discountInput: document.getElementById('discountInput'),
  holdBtn: document.getElementById('holdBtn'),
  recallBtn: document.getElementById('recallBtn'),
  heldCount: document.getElementById('heldCount'),
  checkoutBtn: document.getElementById('checkoutBtn'),
  toast: document.getElementById('toast'),
};

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
(async function init() {
  currentSession = await requireAuth();
  if (!currentSession) return;

  currentProfile = await getUserProfile(currentSession.user.id);
  if (!currentProfile) {
    showToast('تعذر تحميل بيانات المستخدم', true);
    return;
  }

  els.branchLabel.textContent = currentProfile.branches?.name || 'بدون فرع';
  els.cashierLabel.textContent = currentProfile.full_name;

  startClock();
  updateHeldCount();
  renderCart();

  await Promise.all([loadCategories(), loadProducts(), loadCustomers()]);
  renderCategories();
  renderProducts();
})();

function startClock() {
  const tick = () => {
    els.clockLabel.textContent = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit', minute: '2-digit'
    });
  };
  tick();
  setInterval(tick, 1000 * 30);
}

els.logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

// ------------------------------------------------------------
// Data loading
// ------------------------------------------------------------
async function loadCategories() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (error) { console.error(error); return; }
  allCategories = data || [];
}

async function loadProducts() {
  const { data, error } = await supabaseClient
    .from('products')
    .select('id, name, category_id, sale_price, unit_type, image_url, product_barcodes(barcode)')
    .eq('is_active', true)
    .order('name');
  if (error) {
    console.error(error);
    els.productGrid.innerHTML = `<div class="empty-state">تعذر تحميل الأصناف — تأكد من إعداد Supabase في js/supabase-client.js</div>`;
    return;
  }
  allProducts = data || [];
}

async function loadCustomers() {
  const { data, error } = await supabaseClient
    .from('customers')
    .select('id, name')
    .order('name')
    .limit(200);
  if (error) { console.error(error); return; }
  (data || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    els.customerSelect.appendChild(opt);
  });
}

// ------------------------------------------------------------
// Rendering: categories + product grid
// ------------------------------------------------------------
function renderCategories() {
  els.categoriesRow.innerHTML = '';
  const allChip = makeCatChip('الكل', 'all');
  els.categoriesRow.appendChild(allChip);
  allCategories.forEach(cat => {
    els.categoriesRow.appendChild(makeCatChip(cat.name, cat.id));
  });
}

function makeCatChip(label, id) {
  const btn = document.createElement('button');
  btn.className = 'cat-chip' + (activeCategory === id ? ' active' : '');
  btn.textContent = label;
  btn.dataset.cat = id;
  btn.addEventListener('click', () => {
    activeCategory = id;
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    renderProducts();
  });
  return btn;
}

function renderProducts() {
  const q = els.searchInput.value.trim().toLowerCase();

  const filtered = allProducts.filter(p => {
    const matchesCat = activeCategory === 'all' || p.category_id === activeCategory;
    if (!matchesCat) return false;
    if (!q) return true;
    const nameMatch = p.name.toLowerCase().includes(q);
    const barcodeMatch = (p.product_barcodes || []).some(b => b.barcode === q);
    return nameMatch || barcodeMatch;
  });

  if (filtered.length === 0) {
    els.productGrid.innerHTML = `<div class="empty-state">مفيش أصناف مطابقة</div>`;
    return;
  }

  els.productGrid.innerHTML = '';
  filtered.forEach(p => {
    const card = document.createElement('button');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-thumb">
        ${p.image_url ? `<img src="${p.image_url}" alt="">` : '🛒'}
      </div>
      <div class="product-name">${escapeHtml(p.name)}</div>
      <div class="product-price"><span class="num">${Number(p.sale_price).toFixed(2)}</span></div>
    `;
    card.addEventListener('click', () => addToCart(p));
    els.productGrid.appendChild(card);
  });
}

// باركود ماسح بيدوس Enter بعد القراءة عادة — لو فيه تطابق تام، ضيفه على طول
els.searchInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const q = els.searchInput.value.trim();
  if (!q) return;
  const exact = allProducts.find(p => (p.product_barcodes || []).some(b => b.barcode === q));
  if (exact) {
    addToCart(exact);
    els.searchInput.value = '';
    renderProducts();
  }
});

els.searchInput.addEventListener('input', renderProducts);

// ------------------------------------------------------------
// Cart
// ------------------------------------------------------------
function addToCart(product) {
  const existing = cart.find(line => line.product.id === product.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ product, quantity: 1, unitPrice: Number(product.sale_price) });
  }
  renderCart();
}

function changeQty(productId, delta) {
  const line = cart.find(l => l.product.id === productId);
  if (!line) return;
  line.quantity += delta;
  if (line.quantity <= 0) {
    cart = cart.filter(l => l.product.id !== productId);
  }
  renderCart();
}

function removeLine(productId) {
  cart = cart.filter(l => l.product.id !== productId);
  renderCart();
}

function calcSubtotal() {
  return cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}

function calcTotal() {
  const discount = Number(els.discountInput.value) || 0;
  return Math.max(0, calcSubtotal() - discount);
}

function renderCart() {
  if (cart.length === 0) {
    els.cartItems.innerHTML = `<div class="cart-empty">لسه مفيش أصناف مضافة للفاتورة</div>`;
  } else {
    els.cartItems.innerHTML = '';
    cart.forEach(line => {
      const row = document.createElement('div');
      row.className = 'cart-line';
      const lineTotal = (line.quantity * line.unitPrice).toFixed(2);
      row.innerHTML = `
        <div class="cart-line-name">${escapeHtml(line.product.name)}</div>
        <div class="cart-line-total"><span class="num">${lineTotal}</span></div>
        <div class="cart-line-controls">
          <button class="qty-btn" data-action="dec">−</button>
          <span class="qty-value num">${line.quantity}</span>
          <button class="qty-btn" data-action="inc">+</button>
          <span class="unit-price num">${line.unitPrice.toFixed(2)} / وحدة</span>
          <button class="remove-btn" data-action="remove">حذف</button>
        </div>
      `;
      row.querySelector('[data-action="inc"]').addEventListener('click', () => changeQty(line.product.id, 1));
      row.querySelector('[data-action="dec"]').addEventListener('click', () => changeQty(line.product.id, -1));
      row.querySelector('[data-action="remove"]').addEventListener('click', () => removeLine(line.product.id));
      els.cartItems.appendChild(row);
    });
  }

  els.subtotalLabel.textContent = calcSubtotal().toFixed(2);
  els.totalLabel.textContent = calcTotal().toFixed(2);
  els.checkoutBtn.disabled = cart.length === 0;
}

els.discountInput.addEventListener('input', renderCart);

// ------------------------------------------------------------
// Hold / Recall
// ------------------------------------------------------------
els.holdBtn.addEventListener('click', () => {
  if (cart.length === 0) return showToast('الفاتورة فاضية، مفيش حاجة تتعلّق', true);
  heldOrders.push({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    cart: cart.map(l => ({ productId: l.product.id, name: l.product.name, quantity: l.quantity, unitPrice: l.unitPrice })),
    discount: Number(els.discountInput.value) || 0,
    customerId: els.customerSelect.value || null,
  });
  localStorage.setItem('pos_held_orders', JSON.stringify(heldOrders));
  cart = [];
  els.discountInput.value = 0;
  renderCart();
  updateHeldCount();
  showToast('اتعلّقت الفاتورة');
});

els.recallBtn.addEventListener('click', () => {
  if (heldOrders.length === 0) return showToast('مفيش فواتير معلّقة', true);
  const last = heldOrders.pop();
  localStorage.setItem('pos_held_orders', JSON.stringify(heldOrders));
  cart = last.cart.map(l => ({
    product: allProducts.find(p => p.id === l.productId) || { id: l.productId, name: l.name, sale_price: l.unitPrice },
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));
  els.discountInput.value = last.discount || 0;
  if (last.customerId) els.customerSelect.value = last.customerId;
  renderCart();
  updateHeldCount();
  showToast('استرجعت آخر فاتورة معلّقة');
});

function updateHeldCount() {
  els.heldCount.textContent = heldOrders.length;
}

// ------------------------------------------------------------
// Checkout
// ------------------------------------------------------------
els.checkoutBtn.addEventListener('click', async () => {
  if (cart.length === 0) return;
  els.checkoutBtn.disabled = true;
  els.checkoutBtn.textContent = 'جاري إتمام البيع...';

  try {
    const subtotal = calcSubtotal();
    const discount = Number(els.discountInput.value) || 0;
    const total = calcTotal();
    const customerId = els.customerSelect.value || null;

    const { data: sale, error: saleError } = await supabaseClient
      .from('sales')
      .insert({
        branch_id: currentProfile.branch_id,
        user_id: currentProfile.id,
        customer_id: customerId,
        status: 'completed',
        subtotal,
        discount,
        tax: 0,
        total,
        paid_amount: total,
        remaining: 0,
      })
      .select()
      .single();
    if (saleError) throw saleError;

    const saleItems = cart.map(l => ({
      sale_id: sale.id,
      product_id: l.product.id,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount: 0,
      total: l.quantity * l.unitPrice,
    }));
    const { error: itemsError } = await supabaseClient.from('sale_items').insert(saleItems);
    if (itemsError) throw itemsError;

    const stockRows = cart.map(l => ({
      product_id: l.product.id,
      branch_id: currentProfile.branch_id,
      quantity: -l.quantity,
      type: 'sale',
      reference_id: sale.id,
      user_id: currentProfile.id,
    }));
    const { error: stockError } = await supabaseClient.from('stock_transactions').insert(stockRows);
    if (stockError) throw stockError;

    showToast(`تمت الفاتورة رقم ${sale.invoice_number} بنجاح`);
    cart = [];
    els.discountInput.value = 0;
    els.customerSelect.value = '';
    renderCart();
  } catch (err) {
    console.error(err);
    showToast('حصل خطأ أثناء إتمام البيع، حاول تاني', true);
  } finally {
    els.checkoutBtn.disabled = cart.length === 0;
    els.checkoutBtn.textContent = 'إتمام البيع';
  }
});

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function showToast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle('error', isError);
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
