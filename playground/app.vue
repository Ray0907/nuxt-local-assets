<template>
	<div class="container">
		<h1>Nuxt Local Assets - Playground</h1>

		<section>
			<h2>Test Files</h2>
			<ul>
				<li>
					<a href="/files/test.txt" target="_blank">/files/test.txt</a>
					- Text file
				</li>
				<li>
					<a href="/files/sample.pdf" target="_blank">/files/sample.pdf</a>
					- PDF document
				</li>
				<li>
					<a href="/files/image.png" target="_blank">/files/image.png</a>
					- Image file
				</li>
			</ul>
		</section>

		<section>
			<h2>Security Tests</h2>
			<ul>
				<li>
					<a href="/files/../etc/passwd" target="_blank">/files/../etc/passwd</a>
					- Should return 400 (path traversal)
				</li>
				<li>
					<a href="/files/script.exe" target="_blank">/files/script.exe</a>
					- Should return 403 (blocked extension)
				</li>
			</ul>
		</section>

		<section>
			<h2>Range Request Test</h2>
			<button @click="testRangeRequest">
				Test Range Request
			</button>
			<pre v-if="rangeResult">{{ rangeResult }}</pre>
		</section>

		<section>
			<h2>Cache Test</h2>
			<button @click="testCache">
				Test ETag Cache
			</button>
			<pre v-if="cacheResult">{{ cacheResult }}</pre>
		</section>
	</div>
</template>

<script setup lang="ts">
const rangeResult = ref('')
const cacheResult = ref('')

async function testRangeRequest() {
	try {
		const response = await fetch('/files/test.txt', {
			headers: {
				'Range': 'bytes=0-10',
			},
		})

		rangeResult.value = `Status: ${response.status}
Content-Range: ${response.headers.get('content-range')}
Content-Length: ${response.headers.get('content-length')}
Body: ${await response.text()}`
	}
	catch (error) {
		rangeResult.value = `Error: ${error}`
	}
}

async function testCache() {
	try {
		// First request to get ETag
		const response1 = await fetch('/files/test.txt')
		const etag = response1.headers.get('etag')

		// Second request with If-None-Match
		const response2 = await fetch('/files/test.txt', {
			headers: {
				'If-None-Match': etag || '',
			},
		})

		cacheResult.value = `First request: ${response1.status}
ETag: ${etag}
Second request: ${response2.status} (should be 304)`
	}
	catch (error) {
		cacheResult.value = `Error: ${error}`
	}
}
</script>

<style>
.container {
	max-width: 800px;
	margin: 0 auto;
	padding: 2rem;
	font-family: system-ui, sans-serif;
}

section {
	margin: 2rem 0;
	padding: 1rem;
	border: 1px solid #ddd;
	border-radius: 8px;
}

h1 {
	color: #00dc82;
}

h2 {
	margin-top: 0;
}

ul {
	list-style: none;
	padding: 0;
}

li {
	margin: 0.5rem 0;
}

a {
	color: #00dc82;
}

button {
	background: #00dc82;
	color: white;
	border: none;
	padding: 0.5rem 1rem;
	border-radius: 4px;
	cursor: pointer;
}

button:hover {
	background: #00b36b;
}

pre {
	background: #f5f5f5;
	padding: 1rem;
	border-radius: 4px;
	overflow-x: auto;
}
</style>
