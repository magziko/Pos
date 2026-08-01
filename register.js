// ============================================================
// إنشاء حساب — لأول مرة بيكون أدمن، وبعد كده الافتراضي كاشير
// ============================================================

const form = document.getElementById('registerForm');
const errorMsg = document.getElementById('errorMsg');
const successMsg = document.getElementById('successMsg');
const submitBtn = document.getElementById('submitBtn');

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.add('show');
  successMsg.classList.remove('show');
}

function showSuccess(msg) {
  successMsg.textContent = msg;
  successMsg.classList.add('show');
  errorMsg.classList.remove('show');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.classList.remove('show');
  successMsg.classList.remove('show');
  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري الإنشاء...';

  const fullName = document.getElementById('fullName').value.trim();
  const branchName = document.getElementById('branchName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    // 1) إنشاء حساب الدخول (auth)
    const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({ email, password });
    if (signUpError) throw signUpError;

    // لو مفعّل "Confirm email" في إعدادات Supabase، مش هيكون فيه session فورًا
    if (!signUpData.session) {
      showSuccess('اتعمل الحساب. لو مفعّل تأكيد البريد الإلكتروني في إعدادات Supabase، تحقق من بريدك وفعّل الحساب قبل ما تسجّل دخول.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'إنشاء الحساب';
      return;
    }

    const userId = signUpData.user.id;

    // 2) هل ده أول مستخدم في النظام؟
    const { count: existingUsersCount } = await supabaseClient
      .from('users_profile')
      .select('id', { count: 'exact', head: true });

    const isFirstUser = !existingUsersCount || existingUsersCount === 0;

    // 3) هات أو أنشئ الفرع
    let branchId;
    const { data: existingBranch } = await supabaseClient
      .from('branches')
      .select('id')
      .eq('name', branchName)
      .maybeSingle();

    if (existingBranch) {
      branchId = existingBranch.id;
    } else {
      const { data: newBranch, error: branchError } = await supabaseClient
        .from('branches')
        .insert({ name: branchName })
        .select()
        .single();
      if (branchError) throw branchError;
      branchId = newBranch.id;
    }

    // 4) هات أو أنشئ الدور (أدمن لأول مستخدم، كاشير لأي حد بعده)
    const roleName = isFirstUser ? 'admin' : 'cashier';
    let roleId;
    const { data: existingRole } = await supabaseClient
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .maybeSingle();

    if (existingRole) {
      roleId = existingRole.id;
    } else {
      const permissions = isFirstUser ? { all: true } : { sales: true };
      const { data: newRole, error: roleError } = await supabaseClient
        .from('roles')
        .insert({ name: roleName, permissions })
        .select()
        .single();
      if (roleError) throw roleError;
      roleId = newRole.id;
    }

    // 5) اعمل صف المستخدم (users_profile)
    const { error: profileError } = await supabaseClient
      .from('users_profile')
      .insert({
        id: userId,
        full_name: fullName,
        role_id: roleId,
        branch_id: branchId,
        is_active: true,
      });
    if (profileError) throw profileError;

    showSuccess(isFirstUser
      ? 'اتعمل حساب الأدمن بنجاح! هتتحول لشاشة المبيعات...'
      : 'اتعمل الحساب بنجاح! هتتحول لشاشة المبيعات...');

    setTimeout(() => { window.location.href = 'pos.html'; }, 1200);

  } catch (err) {
    console.error(err);
    showError(err.message || 'حصل خطأ أثناء إنشاء الحساب، حاول تاني');
    submitBtn.disabled = false;
    submitBtn.textContent = 'إنشاء الحساب';
  }
});
