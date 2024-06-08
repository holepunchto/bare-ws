all: \
	cert.key \
	cert.crt

%.key:
	openssl genpkey \
		-algorithm rsa \
		-out $@

%.crt: %.cnf %.key
	openssl req \
		-x509 \
		-noenc \
		-days 365 \
		-config $*.cnf \
		-key $*.key \
		-out $@
