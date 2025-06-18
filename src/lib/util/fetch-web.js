const target = import.meta.env.VITE_LIMITLESS_WEB

export function get(url) {
	return new Promise((resolve, reject) => {
		fetch(url)
			.then((res) => res.json())
			.then(resolve)
			.catch(reject);
	});
}

export function post(url, data) {
	return new Promise((resolve, reject) => {
		fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		})
			.then((res) => res.json())
			.then(resolve)
			.catch(reject);
	});
}