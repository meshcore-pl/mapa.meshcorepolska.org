import { initModal } from './modal.js';

const msPerDay = 86400000;
const periodDays = { '24h': 1, '7d': 7, '30d': 30 };

export const initStatsModal = ({ getNodes, getRepeaters, escapeHtml, timeAgo, onFocusNode }) => {
	const modal = initModal('stats-toggle', 'stats-overlay');
	const chipEls = {
		'24h': document.getElementById('stats-chip-24h'),
		'7d': document.getElementById('stats-chip-7d'),
		'30d': document.getElementById('stats-chip-30d'),
	};
	const periodButtons = [...document.querySelectorAll('.stats-period-btn')];
	const listEl = document.getElementById('stats-repeater-list');

	let activePeriod = '24h';

	const countSince = (nodes, days) => {
		const threshold = Date.now() - days * msPerDay;
		let count = 0;
		for (const node of nodes) if (node.insertDate.getTime() > threshold) count++;
		return count;
	};

	const renderList = () => {
		const threshold = Date.now() - periodDays[activePeriod] * msPerDay;
		const repeaters = getRepeaters()
			.filter(node => node.insertDate.getTime() > threshold)
			.toSorted((a, b) => b.insertDate.getTime() - a.insertDate.getTime());

		listEl.innerHTML = repeaters.length
			? repeaters.map(node => `
				<li>
					<svg width="28" height="28"><use href="/icons/node-types.svg#repeater-plain"></use></svg>
					<div class="stats-repeater-text">
						<h6>${escapeHtml(node.adv_name)}</h6>
						<span>${timeAgo(node.insertDate.getTime())}</span>
					</div>
				</li>
			`).join('')
			: '<li class="stats-repeater-empty">Brak nowych repeaterów w tym okresie.</li>';

		[...listEl.children].forEach((li, index) => {
			const node = repeaters[index];
			if (!node) return;
			li.addEventListener('click', () => {
				modal.close();
				onFocusNode(node);
			});
		});
	};

	const render = () => {
		const nodes = getNodes();
		for (const [period, el] of Object.entries(chipEls)) {
			el.textContent = countSince(nodes, periodDays[period]);
		}
		renderList();
	};

	periodButtons.forEach(btn => {
		btn.addEventListener('click', () => {
			activePeriod = btn.dataset.period;
			periodButtons.forEach(b => b.classList.toggle('active', b === btn));
			renderList();
		});
	});

	return { ...modal, render };
};
