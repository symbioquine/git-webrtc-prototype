const intoStream = require('into-stream');
const splitBuffer = require('buffer-chunks');
const isoGitMuxSideBand = require('../src/IsoGitMuxSideBand');
const { GitSideBand, listObjects: isoGitListObjects, collect } = require('isomorphic-git/dist/internal.umd.min.js');

const git = require('isomorphic-git');
const fs = require('fs');

test('git-upload-pack side-band round-trip', async function () {
  console.log(isoGitMuxSideBand);
  console.log(GitSideBand.demux);

  git.plugins.set('fs', fs);

  const dir = '~/repositories/git/farm-os-area-feature-proxy';

  const oids = await isoGitListObjects({fs, dir, oids: ['e196af265221874ddfb3609306f9f80c8d26d565']});

  const { packfile } = await git.packObjects({dir, oids: Array.from(oids)});

  const body = isoGitMuxSideBand ({
    protocol: 'side-band-64k',
    packetlines: [],
    packfile: packfile,
  });

  const demuxed = GitSideBand.demux(body);

  const outpackfile = Buffer.from(await collect(demuxed.packfile));

  expect(Buffer.from(outpackfile).slice(0, -1)).toStrictEqual(packfile);
});

