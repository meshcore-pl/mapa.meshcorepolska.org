const getContainer = () => document.getElementById('toast-container');

const renderToastContent = (el, message, status) => {
	el.className = `toast toast-${status}`;
	el.innerHTML = status === 'loading'
		? `<span class="toast-icon toast-icon-loading"><span class="toast-spinner"></span></span><span>${message}</span>`
		: `<span class="toast-icon"><svg class="icon" aria-hidden="true"><use href="/icons/toast-icons.svg#${status}"></use></svg></span><span>${message}</span>`;
};

const scheduleDismiss = (el, duration) => {
	clearTimeout(el.dismissTimer);
	el.dismissTimer = setTimeout(() => {
		el.classList.remove('toast-visible');
		el.addEventListener('transitionend', () => el.remove(), { once: true });
	}, duration);
};

export const showToast = (message, { duration = 2200, status = 'success' } = {}) => {
	const el = document.createElement('div');
	renderToastContent(el, message, status);

	getContainer().appendChild(el);
	requestAnimationFrame(() => el.classList.add('toast-visible'));

	if (duration) scheduleDismiss(el, duration);
	return el;
};

export const updateToast = (el, message, { duration = 2200, status = 'success' } = {}) => {
	if (!el?.isConnected) return showToast(message, { duration, status });

	clearTimeout(el.dismissTimer);
	renderToastContent(el, message, status);
	el.classList.add('toast-visible');
	if (duration) scheduleDismiss(el, duration);
	return el;
};
