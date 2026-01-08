export default defineNuxtConfig({
	modules: ['../src/module'],

	localAssets: {
		dirs: [
			{
				name: 'uploads',
				path: '/data/uploads',
				route: '/files',
				devPath: './playground/uploads',
			},
		],

		auth: {
			required: false,
			// authorize: '~/server/utils/authorize',
		},

		audit: {
			enabled: true,
			handler: '~/server/utils/audit',
		},

		security: {
			allowedMimeTypes: ['image/*', 'application/pdf', 'text/*'],
			blockedExtensions: ['.exe', '.sh', '.bat'],
			maxFileSize: '50mb',
		},

		cache: {
			etag: true,
			lastModified: true,
			rules: [
				{ match: /\.(jpg|jpeg|png|gif|webp)$/i, maxAge: 86400 },
				{ match: /\.pdf$/i, maxAge: 3600 },
			],
		},

		compression: {
			enabled: true,
			types: ['text/*', 'application/json'],
			threshold: '100b', // Lower threshold for testing
		},

		rangeRequest: {
			enabled: true,
		},

		redirect: {
			// handler: '~/server/utils/redirect',
		},
	},

	devtools: { enabled: true },

	compatibilityDate: '2024-01-01',
})
