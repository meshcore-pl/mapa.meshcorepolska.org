export const initModal = (toggleId, overlayId, { closeOnOutsideClick = false } = {}) => {
	const toggle = document.getElementById(toggleId);
	const overlay = document.getElementById(overlayId);

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

	if (closeOnOutsideClick) {
		document.addEventListener('click', e => {
			if (!overlay.hidden && !overlay.contains(e.target) && !toggle.contains(e.target)) close();
		});
	} else {
		overlay.addEventListener('click', e => {
			if (e.target === overlay) close();
		});
	}

	document.addEventListener('keydown', e => {
		if (e.key === 'Escape' && !overlay.hidden) close();
	});

	return { toggle, overlay, open, close };
};
