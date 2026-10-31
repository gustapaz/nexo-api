//! Dependency planning. No clocks, filesystem, network or external crates.
const WIDTH: usize = 10;

/// Input: [n, duration[n], adjacency[n*n]], with adjacency[dependency*n+task].
/// Output: [status, makespan, critical_duration, path_end+1] followed by n rows:
/// [ES, EF, LS, LF, slack, topo_rank, start, finish, worker, predecessor+1].
pub fn plan(data: &[u32], workers: usize) -> Vec<u32> {
    let n = data.first().copied().unwrap_or(0) as usize;
    if !(1..=64).contains(&n) || !(1..=8).contains(&workers) || data.len() != 1 + n + n * n {
        return vec![2, 0, 0, 0];
    }
    let durations = &data[1..1 + n];
    let edges = &data[1 + n..];
    if durations.iter().any(|&d| !(1..=86400).contains(&d))
        || edges.iter().any(|&e| e > 1)
        || edges.iter().filter(|&&e| e == 1).count() > 256
    {
        return vec![2, 0, 0, 0];
    }
    let edge = |a: usize, b: usize| edges[a * n + b] == 1;
    let mut indegree: Vec<usize> = (0..n)
        .map(|i| (0..n).filter(|&j| edge(j, i)).count())
        .collect();
    let mut order = Vec::with_capacity(n);
    let mut used = vec![false; n];
    while let Some(i) = (0..n).find(|&i| !used[i] && indegree[i] == 0) {
        used[i] = true;
        order.push(i);
        for j in 0..n {
            if edge(i, j) {
                indegree[j] -= 1;
            }
        }
    }
    let mut output = vec![0; 4 + WIDTH * n];
    if order.len() != n {
        output[0] = 1;
        for i in 0..n {
            output[4 + WIDTH * i] = u32::from(!used[i]);
        }
        return output;
    }
    let mut es = vec![0; n];
    let mut ef = vec![0; n];
    let mut pred = vec![0; n];
    for &i in &order {
        for j in 0..n {
            if edge(j, i) && (pred[i] == 0 || ef[j] > es[i]) {
                es[i] = ef[j];
                pred[i] = j as u32 + 1;
            }
        }
        ef[i] = es[i] + durations[i];
    }
    let critical = *ef.iter().max().unwrap();
    let end = (0..n).find(|&i| ef[i] == critical).unwrap();
    let mut ls = vec![0; n];
    let mut lf = vec![critical; n];
    let mut bottom = durations.to_vec();
    for &i in order.iter().rev() {
        for j in 0..n {
            if edge(i, j) {
                lf[i] = lf[i].min(ls[j]);
                bottom[i] = bottom[i].max(durations[i] + bottom[j]);
            }
        }
        ls[i] = lf[i] - durations[i];
    }
    let mut state = vec![0; n];
    let mut start = vec![0; n];
    let mut finish = vec![0; n];
    let mut assigned = vec![0; n];
    let mut running = vec![None; workers];
    let mut time = 0;
    let mut completed = 0;
    while completed < n {
        for w in 0..workers {
            if running[w].is_some() {
                continue;
            }
            let candidate = (0..n)
                .filter(|&i| state[i] == 0 && (0..n).all(|j| !edge(j, i) || state[j] == 2))
                .max_by(|&a, &b| bottom[a].cmp(&bottom[b]).then_with(|| b.cmp(&a)));
            if let Some(i) = candidate {
                state[i] = 1;
                start[i] = time;
                finish[i] = time + durations[i];
                assigned[i] = w as u32;
                running[w] = Some(i);
            }
        }
        time = running
            .iter()
            .filter_map(|&i| i.map(|i| finish[i]))
            .min()
            .unwrap();
        for slot in &mut running {
            if let Some(i) = *slot {
                if finish[i] == time {
                    state[i] = 2;
                    completed += 1;
                    *slot = None;
                }
            }
        }
    }
    output[1] = time;
    output[2] = critical;
    output[3] = end as u32 + 1;
    for (rank, &i) in order.iter().enumerate() {
        let row = [
            es[i],
            ef[i],
            ls[i],
            lf[i],
            ls[i] - es[i],
            rank as u32,
            start[i],
            finish[i],
            assigned[i],
            pred[i],
        ];
        output[4 + WIDTH * i..4 + WIDTH * (i + 1)].copy_from_slice(&row);
    }
    output
}

/// Allocations cross the trusted adapter boundary, not the public HTTP boundary.
#[no_mangle]
pub extern "C" fn alloc(words: usize) -> *mut u32 {
    Box::into_raw(vec![0; words].into_boxed_slice()) as *mut u32
}

/// # Safety
/// ptr must be an allocation returned by alloc/solve with exactly words elements.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u32, words: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
        ptr, words,
    )));
}

/// # Safety
/// ptr must contain words initialized u32s allocated by alloc.
#[no_mangle]
pub unsafe extern "C" fn solve(ptr: *const u32, words: usize, workers: usize) -> *mut u32 {
    let input = std::slice::from_raw_parts(ptr, words);
    Box::into_raw(plan(input, workers).into_boxed_slice()) as *mut u32
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chain_and_cycle() {
        let result = plan(&[2, 3, 5, 0, 1, 0, 0], 2);
        assert_eq!(&result[0..4], &[0, 8, 8, 2]);
        assert_eq!(plan(&[2, 3, 5, 0, 1, 1, 0], 2)[0], 1);
    }
    #[test]
    fn invalid_abi() {
        assert_eq!(plan(&[], 1)[0], 2);
        assert_eq!(plan(&[1, 0, 0], 1)[0], 2);
        assert_eq!(plan(&[1, 3, 0], 0)[0], 2);
        assert_eq!(plan(&[1, 3, 2], 1)[0], 2);
    }
}
