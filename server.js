const express = require('express');
const bodyParser = require('body-parser');
const { execSync } = require('child_process');
const config = require('./config.json');
const Build = require('github-build');

const server = express();

server.use(bodyParser.json());
server.post('/build/:id/:secret', (req, res) => {
	if (config[req.params.id] !== req.params.secret)
		return res.send({ status: 403, body: 'Forbidden.'});
	if (req.headers['x-github-event'] !== 'push')
		return res.send({ status: 204, body: 'Untracked event.'});

	const branch = req.body.ref.match(/refs\/heads\/(.+)/)[1];

	if (branch !== 'master')
		return res.send({ status: 204, body: 'Untracked branch.'});
	if (req.body.before === req.body.after)
		return res.send({ status: 204, body: 'No changes.'});

	const data = {
		repo: 'zajrik/yamdbf',
		sha: req.body.after,
		token: config.token,
		label: 'YAMDBF Prebuilt Build',
		description: 'Building YAMDBF...',
		url: `https://github.com/zajrik/yamdbf/tree/indev`
	}

	const build = new Build(data);
	build.start().then(() => {
		try
		{
			let result;
			let opts = { cwd: config['indev'] };

			console.log(`Starting YAMDBF prebuilt build as of yamdbf/master#${req.body.after}`);
			execSync('git clean -df && git checkout .', opts);
			execSync('git pull', opts);
			try { execSync('rm -rf node_modules', opts); } catch (err) {}
			execSync('yarn && gulp gh-prebuild', opts)

			let gitStatus = execSync(`cd ../yamdbf-prebuilt && git status`, opts).toString();
			if (gitStatus.includes('nothing to commit'))
			{
				data.description = 'No code changes.';
				build.pass();
			}
			else
			{
				result = execSync(
					`cd ../yamdbf-prebuilt && git add --all && git commit -m "Build YAMDBF prebuilt: ${req.body.after}" && git push`,
					opts).toString();
				
				console.log(result);
				data.description = 'Successfully built YAMDBF.';
				build.pass();
			}
			
			return res.send({ status: 200, body: 'Successfully built YAMDBF.'});
		}
		catch (err)
		{
			console.error(err);
			data.description = 'YAMDBF build failed.';
			build.fail();
			return res.send({ status: 500, body: 'Failed building YAMDBF.'});
		}
	})
	.catch(console.error);
});

server.listen(config.port, () => console.log('Build server started'));