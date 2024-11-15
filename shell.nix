{pkgs ? import <nixpkgs> {}}:
pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs
  ];

  shellHook = ''
    # Install epub-cfi-generator locally
    if [ ! -d node_modules ]; then
      npm install epub-cfi-generator
    fi
  '';
}
