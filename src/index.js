const splitBuffer = require('buffer-chunks');
const qrcode = require('qrcode');

import WebRTCPeerNet from './WebRTCPeerNet';
const concatUint8Arrays = require('./concatUint8Arrays');

const git = require('isomorphic-git');
import FS from '@isomorphic-git/lightning-fs';

// We're doing some stuff that doesn't seem to be fully supported by iso-git's external
// APIs such as decorating the default http plugin and implementing the git-upload-pack
// smart protocol.
const {http: defaultIsoGitHttp, uploadPack: isoGitUploadPack, GitPktLine: GitPktLine, collect, parseUploadPackRequest, listObjects: isoGitListObjects} = require('isomorphic-git/dist/internal.umd.min.js');

const isoGitMuxSideBand = require('./IsoGitMuxSideBand');
const pify = require('pify');

window.fs = new FS("GReAMS-fs");
window.pfs = pify(window.fs);

//if ('serviceWorker' in navigator) {
//  window.addEventListener('load', () => {
//    navigator.serviceWorker.register('/sw.js').then(registration => {
//      console.log('SW registered: ', registration);
//    }).catch(registrationError => {
//      console.log('SW registration failed: ', registrationError);
//    });
//  });
//}


async function run() {
  const contentBoxElem = document.createElement('div');
  document.body.appendChild(contentBoxElem);

  const logBoxElem = document.createElement('div');
  document.body.appendChild(logBoxElem);

  function log(msg) {
    const logLineElem = document.createElement('span');
    logLineElem.innerHTML = JSON.stringify(arguments) + "<br>";
    logBoxElem.appendChild(logLineElem);
  }

  var dir;

  const peerNet = new WebRTCPeerNet(async function(request) {
    console.log("Got request: ", request);

    const requestUrl = new URL(request.url);

    const pathParts = requestUrl.pathname.split('/').filter(p => !!p);

    if (pathParts[0] == 'GReAMS.git') {
      const gitPath = pathParts.slice(1).join('/');

      if (request.method == 'GET' && gitPath == 'info/refs' && requestUrl.searchParams.get('service') == 'git-upload-pack') {
        const svcLine = GitPktLine.encode("# service=git-upload-pack\n");
        const refsAdBody = await isoGitUploadPack({ fs, dir, advertiseRefs: true });

        const refsAd = concatUint8Arrays([svcLine, ...refsAdBody]);

        return {
          body: refsAd.buffer
        };
      }

      if (request.method == 'POST' && gitPath == 'git-upload-pack') {
        const upPackReq = await parseUploadPackRequest(request.body);

        const oids = await isoGitListObjects({fs, dir, oids: upPackReq.wants});

        const { packfile } = await git.packObjects({dir, oids: Array.from(oids)});

        const body = isoGitMuxSideBand ({
          protocol: 'side-band-64k',
          packetlines: ['NAK'],
          packfile: packfile,
        });

        const result = await collect(body)

        return {
          body: result
        };

      }

      const contents = await pfs.readFile(`/GReAMS-initial-${peerNet.selfPeerId}/.git/` + gitPath, {'encoding': 'utf8'})

      return {
        body: contents.toString()
      };
    }

    return {
      body: 'pong'
    };
  });
  const selfPeerId = peerNet.selfPeerId;

  const startLocation = window.location;

  const startUrl = new URL(startLocation);

  const joinUrl = new URL(startLocation);
  joinUrl.searchParams.set('withPeer', selfPeerId);

  const res = await qrcode.toDataURL(joinUrl.toString());

  contentBoxElem.innerHTML = `Hello my identifier is <a href="${joinUrl.toString()}">${selfPeerId}</a><br><br>Scan to add additional peers;<br><img src='${res}' />`;

  const connectPeerId = startUrl.searchParams.get('withPeer');

  log("connectPeerId:", connectPeerId);


  const httpOverWebRTC = async function ({
    core,
    emitter,
    emitterPrefix,
    url,
    method = 'GET',
    headers = {},
    body
  }) {
    const res = await peerNet.request(url, method, headers, body)
    return {
      url: res.url,
      method: res.method,
      statusCode: res.status,
      statusMessage: res.statusText,
      body: res.body,
      headers: res.headers
    }
  }

  const hybridHttpPlugin = async function ({
    core,
    emitter,
    emitterPrefix,
    url,
    method = 'GET',
    headers = {},
    body
  }) {
    var plugin = defaultIsoGitHttp;
    if (url.indexOf('.webrtcpeer') != -1) {
      plugin = httpOverWebRTC;
    }
    return await plugin({core: core, emitter: emitter, emitterPrefix: emitterPrefix, url: url, method: method, headers: headers, body: body});
  }

  git.plugins.set('http', hybridHttpPlugin);
  git.plugins.set('fs', window.fs);

  if (connectPeerId) {
    dir = `/GReAMS-fromPeer-${selfPeerId}`;
    await pfs.mkdir(dir);

    await git.clone({
      dir: dir,
      url: `http://${connectPeerId}.webrtcpeer/GReAMS.git`,
      ref: 'master',
      singleBranch: true,
      depth: 1
    });
  } else {
    dir = `/GReAMS-initial-${selfPeerId}`
    await pfs.mkdir(dir);

    await git.clone({
      dir: dir,
      corsProxy: 'https://cors.isomorphic-git.org',
      url: 'https://github.com/symbioquine/farm-os-area-feature-proxy.git',
      ref: 'master',
      singleBranch: true,
      depth: 1
    });

  }

  // Now it should not be empty...
  const contentsAfter = await pfs.readdir(dir);
  log("contentsAfter:", contentsAfter);
}

run().catch(error => console.error(error));

