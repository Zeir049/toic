def _try_launch_gui():
    """Return True if the tkinter GUI was launched, False if it isn't usable here."""
    try:
        import tkinter as tk
    except ImportError:
        return False

    try:
        root = tk.Tk()
    except Exception:
        # tkinter is installed but there's no usable display (e.g. headless server)
        return False

    from app.gui.main_window import ToeicGraderApp

    ToeicGraderApp(root)
    root.mainloop()
    return True


def main():
    if _try_launch_gui():
        return

    print("tkinter/디스플레이를 사용할 수 없어 CLI 모드로 실행합니다.\n")
    from app.cli import run_cli

    run_cli()


if __name__ == "__main__":
    main()
