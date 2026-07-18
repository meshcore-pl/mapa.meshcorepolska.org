import { initModal } from './modal.js';

export const initLegendPanel = () => {
	const { toggle, overlay: panel, open, close } = initModal('legend-toggle', 'legend-panel', { closeOnOutsideClick: true });
	return { toggle, panel, open, close };
};
