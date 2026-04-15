export default {
	tags: [
		"posts"
	],
	"layout": "layouts/post.njk",
	eleventyComputed: {
		year: data => new Date(data.date).getFullYear(),
	}
};
