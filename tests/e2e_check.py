"""Browser test for Owner HQ. Serves public/ and drives it like an owner.
Run: python tests/e2e_check.py   (needs node, playwright; axe-core optional at /tmp/axe.min.js)"""
import json, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8791
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "-d", str(ROOT / "public")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
axe = Path("/tmp/axe.min.js").read_text() if Path("/tmp/axe.min.js").exists() else None
fails, URL = [], f"http://localhost:{PORT}/"

def check(cond, msg):
    if not cond: fails.append(msg)

def node_total(pg):
    """Recompute the combined 'money in' with core.js inside the page and compare with what's shown."""
    return pg.evaluate("""() => { const S = JSON.parse(localStorage.getItem('owner-hq-v1')); const d = new Date();
      const t = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      return HQ.money(S.businesses.reduce((a,b)=>a+HQ.summarize(b.records,t,S.period).moneyIn,0)); }""")

try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for width in (390, 1280):
            ctx = br.new_context(viewport={"width": width, "height": 900}, accept_downloads=True)
            pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(URL)
            check(pg.is_visible("#welcome"), f"{width}: welcome not shown on first visit")
            pg.click("#t2"); check(pg.input_value("#taskBiz") == "", f"{width}: empty business picker"); pg.click("#t1")
            # 1. examples
            pg.click("#loadExamples"); pg.wait_for_selector(".biz", timeout=10000)
            check(pg.locator(".biz").count() == 3, f"{width}: expected 3 example businesses")
            shown = pg.locator(".tot b").first.inner_text()
            check(shown == node_total(pg), f"{width}: total {shown} != core {node_total(pg)}")
            alerts = pg.inner_text("#alerts")
            check("Sunrise Nails (example): money in is down" in alerts, f"{width}: salon drop not flagged: {alerts}")
            check("overdue" in alerts, f"{width}: overdue call not flagged")
            check(pg.locator("#chart svg polyline").count() == 3, f"{width}: chart lines missing")
            pg.select_option("#period", "90"); check("90 days" in pg.inner_text("#bizList"), f"{width}: period switch failed")
            pg.select_option("#period", "30")
            # 2. upload a real file for a 4th business, with detection + manual remap
            pg.fill("#bizName", "Test Bakery")
            pg.set_input_files("#bizFile", str(ROOT / "public/samples/petal-and-stem-quickbooks-export.csv"))
            pg.wait_for_selector("#mapper:not([hidden])")
            check("Amount" in pg.inner_text("#foundMsg"), f"{width}: detection message wrong: {pg.inner_text('#foundMsg')}")
            check("rows ready" in pg.inner_text("#previewMsg"), f"{width}: preview wrong: {pg.inner_text('#previewMsg')}")
            pg.select_option("#mapAmount", "2")  # 'Num' column: still numbers, preview must update
            check("rows ready" in pg.inner_text("#previewMsg"), f"{width}: remap preview broke")
            pg.select_option("#mapAmount", "5")
            pg.click("#saveBiz"); pg.wait_for_function("document.querySelectorAll('.biz').length===4")
            check("Test Bakery" in pg.inner_text("#bizList"), f"{width}: uploaded business missing")
            # bad file
            bad = ROOT / "tests" / "_bad.csv"; bad.write_text("hello\n")
            pg.set_input_files("#bizFile", str(bad)); pg.click("#saveBiz")
            check(pg.is_visible("#bizErr"), f"{width}: bad file shows no error"); bad.unlink()
            # 3. tasks
            pg.click("#t2")
            check(pg.input_value("#taskBiz") != "", f"{width}: business picker blank after adding businesses")
            check("overdue (1)" in pg.inner_text("#taskList").lower(), f"{width}: overdue group wrong")
            pg.click("#addTask"); check(pg.is_visible("#taskErr"), f"{width}: empty task no error")
            pg.fill("#taskTitle", "Renew business licence"); pg.select_option("#taskBiz", label="Test Bakery"); pg.click("#addTask")
            check("Renew business licence" in pg.inner_text("#taskList"), f"{width}: new task missing")
            pg.select_option("#taskFilter", label="Test Bakery")
            check(pg.locator(".task").count() == 1, f"{width}: filter by business failed")
            pg.check(".task input[type=checkbox]"); check("done (1)" in pg.inner_text("#taskList").lower(), f"{width}: completing a task failed")
            check("To-do Renew" in pg.inner_text("#taskList"), f"{width}: type label runs into the title")
            pg.select_option("#taskFilter", "all")
            # 4. training
            pg.click("#t3")
            pg.fill("#personName", "Sam"); pg.select_option("#personBiz", label="Test Bakery"); pg.click("#addPerson")
            sam = pg.locator(".person", has_text="Sam")
            sam.locator(".lbtn", has_text="Keep private things out").click()
            pg.locator(".choice").first.click(); check("Not quite" in pg.inner_text("#lessonView"), f"{width}: wrong answer accepted")
            pg.locator(".choice").nth(1).click(); check("Lesson done" in pg.inner_text("#lessonView"), f"{width}: right answer not accepted")
            check("1 of 6 done" in sam.inner_text(), f"{width}: progress not updated: {sam.inner_text()}")
            pg.fill("#procTitle", "Opening the bakery"); pg.select_option("#procBiz", label="Test Bakery"); pg.fill("#procSteps", "Unlock\nTurn on ovens\nCount the float"); pg.click("#addProc")
            check("1 of 7 done" in pg.locator(".person", has_text="Sam").inner_text(), f"{width}: procedure not added to Sam's list")
            check("Opening the bakery" not in pg.locator(".person", has_text="Jordan").inner_text(), f"{width}: procedure leaked to another business")
            # 5. persistence + backup + start over
            pg.reload(); pg.wait_for_selector(".biz")
            check(pg.locator(".biz").count() == 4, f"{width}: data not kept after reload")
            pg.click("#openBackup")
            with pg.expect_download() as dl: pg.click("#saveBackup")
            path = dl.value.path(); data = json.loads(Path(path).read_text())
            check(data["app"] == "owner-hq" and len(data["businesses"]) == 4, f"{width}: backup file wrong")
            pg.click("#startOver"); pg.click("#yesReset")
            check(pg.is_visible("#welcome"), f"{width}: start over didn't clear")
            pg.set_input_files("#loadBackup", path)
            pg.wait_for_function("document.querySelectorAll('.biz').length===4")
            check("4 businesses" in pg.inner_text("#backupMsg"), f"{width}: restore message wrong")
            # a11y + layout
            if axe:
                for tab in ("#t1", "#t2", "#t3"):
                    pg.click(tab); pg.add_script_tag(content=axe)
                    v = pg.evaluate("axe.run(document,{runOnly:['wcag2a','wcag2aa']}).then(r=>r.violations.map(v=>v.id+' ('+v.nodes.length+'): '+v.nodes[0].target))")
                    check(not v, f"{width} a11y {tab}: {v}")
            for tab in ("#t1", "#t2", "#t3"):
                pg.click(tab); check(not pg.evaluate("document.documentElement.scrollWidth>window.innerWidth"), f"{width}: sideways scroll on {tab}")
            pg.click("#t1"); pg.screenshot(path=f"/tmp/hq_{width}_biz.png", full_page=True)
            pg.click("#t2"); pg.screenshot(path=f"/tmp/hq_{width}_tasks.png", full_page=True)
            pg.click("#t3"); pg.screenshot(path=f"/tmp/hq_{width}_team.png", full_page=True)
            check(not errs, f"{width}: JS errors {errs}")
            print(f"{width}px flow done")
            ctx.close()
        br.close()
finally:
    srv.terminate()
print("FAILURES:" if fails else "ALL CHECKS PASSED", *fails, sep="\n")
sys.exit(1 if fails else 0)
