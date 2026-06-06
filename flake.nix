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
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            git
            gnumake
            nodejs_22
            typescript-language-server
            xvfb
            google-chrome
            openssl
            mkcert
            # native addon build deps (usb, node-hid for HITL probe access)
            pkg-config
            libusb1
            hidapi
            udev
            python3
          ];

          env.PUPPETEER_SKIP_DOWNLOAD = "1";
          env.PUPPETEER_CHROME = "${pkgs.google-chrome}/bin/google-chrome-stable";
        };
      }
    );
}
