# git-webrtc-prototype

Hacky demo of git clone over WebRTC

## Testing

*Use [mkcert](https://github.com/FiloSottile/mkcert) or your preferred method to create valid TLS certificates;*

```
mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1
```

```
npm install
npm run build
npm start
```
