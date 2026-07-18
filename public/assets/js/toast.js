const getContainer = () => document.getElementById('toast-container');

export const showToast = (message, { duration = 2200 } = {}) => {
	const el = document.createElement('div');
	el.className = 'toast';
	el.innerHTML = `
		<span class="toast-icon">
			<svg class="icon" aria-hidden="true"><use href="/assets/icons/icons.svg#check"></use></svg>
		</span>
		<span>${message}</span>`;

	getContainer().appendChild(el);
	requestAnimationFrame(() => el.classList.add('toast-visible'));

	setTimeout(() => {
		el.classList.remove('toast-visible');
		el.addEventListener('transitionend', () => el.remove(), { once: true });
	}, duration);
};
