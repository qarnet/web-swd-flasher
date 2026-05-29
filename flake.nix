{
  description = "web-swd-flasher dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            git
            gnumake
            nodejs_22
            typescript-language-server
            xvfb
            chromium
          ];

          env.PUPPETEER_SKIP_DOWNLOAD = "1";

          shellHook = ''
            export PUPPETEER_CHROME="${pkgs.chromium}/bin/chromium"
          '';
        };
      }
    );
}
