# 빌드 단계가 없다. 브라우저에서 바로 도는 HTML 한 벌이라 툴체인이 필요 없고,
# 그래서 이미지도 nginx 한 겹뿐이다.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

# 서빙할 파일만 하나씩 적는다. brand/ 의 SVG 원본은 아무도 받지 않는데
# 통째로 COPY 하면 매 배포마다 이미지에 실린다 (SERVICE-CHECKLIST §3).
COPY index.html manifest.webmanifest sw.js og.png \
     icon-16.png icon-32.png icon-180.png icon-512.png \
     /usr/share/nginx/html/

EXPOSE 80
