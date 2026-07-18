export function initSettingsModal() {
	const toggle = document.getElementById('settings-toggle');
	const overlay = document.getElementById('settings-overlay');

	const close = () => {
		overlay.hidden = true;
		toggle.classList.remove('active');
	};

	const open = () => {
		overlay.hidden = false;
		toggle.classList.add('active');
	};

	toggle.addEventListener('click', () => {
		if (overlay.hidden) open();
		else close();
	});

	overlay.addEventListener('click', e => {
		if (e.target === overlay) close();
	});

	document.addEventListener('keydown', e => {
		if (e.key === 'Escape' && !overlay.hidden) close();
	});

	return { toggle, overlay, open, close };
}
