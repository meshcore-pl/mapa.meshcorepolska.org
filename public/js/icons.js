const spriteFiles = [
	{ path: '/icons/icons.svg', label: 'icons.svg (interfejs, linie)', strokeOnly: true },
	{ path: '/icons/node-types.svg', label: 'node-types.svg (typy węzłów)', strokeOnly: false },
];

const output = document.getElementById('output');

const spriteContainer = document.createElement('div');
spriteContainer.hidden = true;
document.body.appendChild(spriteContainer);

const renderSprite = async ({ path, label, strokeOnly }) => {
	const section = document.createElement('section');
	const heading = document.createElement('h2');
	heading.textContent = `${label} — ${path}`;
	section.appendChild(heading);

	let symbolIds;
	try {
		const res = await fetch(path);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const text = await res.text();

		const sprite = document.createElement('div');
		sprite.innerHTML = text;
		spriteContainer.appendChild(sprite);

		symbolIds = [...sprite.querySelectorAll('symbol[id]')].map(s => s.id);
	}
	catch (e) {
		const err = document.createElement('p');
		err.className = 'empty';
		err.textContent = `Nie udało się wczytać ${path}: ${e.message}`;
		section.appendChild(err);
		output.appendChild(section);
		return;
	}

	if (!symbolIds.length) {
		const empty = document.createElement('p');
		empty.className = 'empty';
		empty.textContent = 'Brak symboli w tym pliku.';
		section.appendChild(empty);
		output.appendChild(section);
		return;
	}

	const grid = document.createElement('div');
	grid.className = 'grid';

	for (const id of symbolIds) {
		const card = document.createElement('div');
		card.className = 'card';
		card.innerHTML = `
			<div class="bg"><svg class="${strokeOnly ? 'stroke-only' : ''}"><use href="#${id}"></use></svg></div>
			<code>#${id}</code>
		`;
		grid.appendChild(card);
	}

	section.appendChild(grid);
	output.appendChild(section);
};

spriteFiles.forEach(renderSprite);
