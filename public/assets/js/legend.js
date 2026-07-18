export function initLegendPanel() {
	const toggle = document.getElementById('legend-toggle');
	const panel = document.getElementById('legend-panel');

	const close = () => {
		panel.hidden = true;
		toggle.classList.remove('active');
	};

	const open = () => {
		panel.hidden = false;
		toggle.classList.add('active');
	};

	toggle.addEventListener('click', () => {
		if (panel.hidden) open();
		else close();
	});

	document.addEventListener('click', e => {
		if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) close();
	});

	return { toggle, panel, open, close };
}
