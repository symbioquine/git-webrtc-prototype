import Peer from 'peerjs';
const uuidv4 = require('uuid/v4');

const { collect } = require('isomorphic-git/dist/internal.umd.min.js');

export default class WebRTCPeerNet {
  constructor(handler) {
    this.selfPeerId = uuidv4();
        this._handler = handler;
    this._peer = new Peer(this.selfPeerId, {debug: 2, config: {
      "iceServers": [
        {url: 'stun:stun.l.google.com:19302'},
        {url: 'stun:stun1.l.google.com:19302'},
      ]
    }});

    this._openedPromise = new Promise((resolve, reject) => {
      this._peer.on('open', function (id) {
        resolve(true);
      });
    });

    this._peerNodesByPeerId = {};

    const self = this;

    this._peer.on('connection', function(conn) {
      self._peerNodesByPeerId[conn.peer] = new WebRTCPeerNetPeerNode(self, conn);
    });

    this._peer.on('error', function(err) {
      console.log(err);
    });
  }

  async _handleRequest(conn, request) {
    const res = await this._handler(request);

    conn.send({
      'WebRTCPeerNetProtocol': 'JSON-HTTP-1',
      'isResponse': true,
      'srcPeerId': request.dstPeerId,
      'dstPeerId': request.srcPeerId,
      'requestId': request.requestId,
      'url': res.url || request.url,
      'method': res.method || request.method,
      'headers': res.headers || {},
      'status': res.status || 200,
      'statusText': res.statusText || '',
      'body': res.body || null
    });
  }

  async request(url, method = 'GET', headers = {}, body) {
    const urlObj = new URL(url);

    const hostname = urlObj.hostname;

    const [tld, peerId, ...otherSegs] = hostname.split('.').reverse();

    if (otherSegs.length || !peerId || tld != 'webrtcpeer') {
      throw new Error(`WebRTCPeerNet can only accept request urls in the format 'http://{peer-id}.webrtcpeer/rest-of-url'. Instead got '${url}'`);
    }

    await this._openedPromise;

    var peerNode = this._peerNodesByPeerId[peerId];
    if (!peerNode) {
      peerNode = new WebRTCPeerNetPeerNode(this, this._peer.connect(peerId, {reliable: true}));
      this._peerNodesByPeerId[peerId] = peerNode;
    }

    const response = await peerNode.request(url, method, headers, body);

    return response;
  }
}

class WebRTCPeerNetPeerNode {
  constructor(peerNet, conn) {
    this._peerNet = peerNet;
    this._selfPeerId = peerNet.selfPeerId;
    this._conn = conn;
    this._readyPromise = new Promise((resolve, reject) => {
      this._conn.on('open', function() {
        resolve(true);
      });
    });

    this._pendingRequestResolversById = {};

    const self = this;

    this._conn.on('data', function(data) {
      if (data.WebRTCPeerNetProtocol != 'JSON-HTTP-1') {
        return;
      }
      if (data.isRequest) {
        self._peerNet._handleRequest(self._conn, data);
        return;
      }
      const requestId = data.requestId;
      const resolver = self._pendingRequestResolversById[requestId] || function(d) {};
      delete self._pendingRequestResolversById[requestId];
      resolver(data);
    });

    this._conn.on('error', function(err) {
      console.log(err);
    });
  }

  async request(url, method = 'GET', headers = {}, body, timeoutMillis=16000) {
    await this._readyPromise;

    const requestId = uuidv4();

    if (body) {
      body = await collect(body);
    }

    const self = this;

    const resultPromise = new Promise(resolve => this._pendingRequestResolversById[requestId] = resolve);
    const timeout = new Promise((resolve, reject) => setTimeout(function() {
      delete self._pendingRequestResolversById[requestId];
      reject(new Error(`Request ${requestId} timed out after ${timeoutMillis} millis.`));
    }, timeoutMillis));

    this._conn.send({
      'WebRTCPeerNetProtocol': 'JSON-HTTP-1',
      'isRequest': true,
      'srcPeerId': this._selfPeerId,
      'dstPeerId': this._conn.peer,
      'requestId': requestId,
      'url': url,
      'method': method,
      'headers': headers,
      'body': body
    });

    const res = await Promise.race([resultPromise, timeout]);

    return {
      url: res.url,
      method: res.method,
      status: res.status,
      statusText: res.statusText,
      body: res.body,
      headers: res.headers
    };
  }
}
